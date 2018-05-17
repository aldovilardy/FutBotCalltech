/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");
var emailvalidator = require("email-validator");
var Promise = require('bluebird');
var request = require('request-promise').defaults({ encoding: null });
var request = require("request");

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
// Commented by Aldo to debbug 
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector);
// Commented by Aldo to debbug 
bot.set('storage', tableStorage);

bot.dialog('/', [
    function (session) {
        session.send('¡Hola soy FutBot!');
        builder.Prompts.text(session, "¿Cómo te llamas?");
    },
    function (session, results) {
        session.userData.name = results.response;
        session.beginDialog('/askEmail');
    },
    function (session, results) {
        session.userData.email = results.response;
        builder.Prompts.attachment(session, `${session.userData.name}, envíame tu foto por favor.`, { contentTypes: 'image/*' });
    },
    function (session, results) {
        //session.userData.photo.photo.url = `${results.response[0].contentUrl}`;
        session.userData.photoDownload = checkRequiresToken(session.message)
            ? requestWithToken(session.message.attachments[0].contentUrl)
            : request(session.message.attachments[0].contentUrl);
        session.userData.photo = session.message.attachments[0];

        session.send(`Mi misión es prepararte para el Mundial Rusia 2018.`);
        // Loading the Random Panini Stickers
        request({
            method: 'GET',
            url: 'http://181.48.138.26/FutBotDataBaseWebAPI/api/EtiquetasAleatorias',
            headers: {
                'Cache-Control': 'no-cache'
            },
            timeout: 120000,
        },
            function (error, response, body) {
                if (error) throw new Error(error);
                else {
                    session.userData.ramdomStickers = JSON.parse(body);
                    console.log(`Loading the ${session.userData.ramdomStickers.length} Random Panini Stickers: \n${body}`);
                    session.beginDialog('/selectSticker');
                }
            });

    },
    function (session, results) {
        session.userData.score = 0;

        request({
            method: 'POST',
            url: 'http://181.48.138.26/FutBotDataBaseWebAPI/api/CreaPreguntas',
            headers:
                {
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json'
                },
            timeout: 120000,
            body: session.userData.selectedSticker,
            json: true
        }, function (error, response, body) {
            if (error) throw new Error(error);
            session.userData.questions = body;
            console.log(`Loading the Questions of ${session.userData.selectedSticker.NombreEtiqueta} Panini Sticker: \n${body}`);
            session.beginDialog('/askQuestions');
        });
    },
    function (session, results) {
        //https://image.ibb.co/dnQvk7/tiz_594_AA724.gif
        session.endConversation('¡Gracias por Jugar!');
    }
]);
bot.dialog('/askQuestions', [
    function (session, results) {
        var herocard =
            new builder.HeroCard(session)
                .title(`PRIMERA PREGUNTA`)
                .subtitle(`Trivia Mundialista Rusia 2018 by Calltech S.A.`)
                .text(`${session.userData.questions[0].Statement}`)
                .images([
                    builder.CardImage.create(session, session.userData.selectedSticker.URLImagenModificada)
                ])
                .buttons([
                    builder.CardAction.imBack(session, session.userData.questions[0].Answers[0].Answer, `1) ${session.userData.questions[0].Answers[0].Answer}`),
                    builder.CardAction.imBack(session, session.userData.questions[0].Answers[1].Answer, `2) ${session.userData.questions[0].Answers[1].Answer}`),
                    builder.CardAction.imBack(session, session.userData.questions[0].Answers[2].Answer, `3) ${session.userData.questions[0].Answers[2].Answer}`)
                ]);
        var questionMessage = new builder.Message(session).addAttachment(herocard);
        var questionRetry = new builder.Message(session).addAttachment(herocard);
        questionRetry.text(`Lo siento las preguntas son de selección múltiple, por favor selecciona una de las respuestas habilitadas para la siguiente pregunta: \n${session.userData.questions[0].Statement}`);
        builder.Prompts.choice(
            session,
            questionMessage,
            [
                session.userData.questions[0].Answers[0].Answer,
                session.userData.questions[0].Answers[1].Answer,
                session.userData.questions[0].Answers[2].Answer],
            {
                listStyle: builder.ListStyle.none,
                retryPrompt: (questionRetry)
            });
    },
    function (session, results) {
        var answer = session.userData.questions[0].Answers.find(function (item) {
            return (item.Answer == results.response.entity)
        });
        session.userData.score += answer.Flag;

        var heroCard = new builder.HeroCard(session)
            .title(`SEGUNDA PREGUNTA`)
            .subtitle(`Trivia Mundialista Rusia 2018 by Calltech S.A.`)
            .text(`${session.userData.questions[1].Statement}`)
            .images([
                builder.CardImage.create(session, session.userData.selectedSticker.URLImagenModificada)
            ])
            .buttons([
                builder.CardAction.imBack(session, session.userData.questions[1].Answers[0].Answer, `1) ${session.userData.questions[1].Answers[0].Answer}`),
                builder.CardAction.imBack(session, session.userData.questions[1].Answers[1].Answer, `2) ${session.userData.questions[1].Answers[1].Answer}`),
                builder.CardAction.imBack(session, session.userData.questions[1].Answers[2].Answer, `3) ${session.userData.questions[1].Answers[2].Answer}`)
            ]);
        var questionMessage = new builder.Message(session).addAttachment(heroCard);
        var questionRetry = new builder.Message(session).addAttachment(heroCard);;
        questionRetry.text(`Lo siento las preguntas son de selección múltiple, por favor selecciona una de las respuestas habilitadas para la siguiente pregunta: \n${session.userData.questions[1].Statement}`);
        builder.Prompts.choice(
            session,
            questionMessage,
            [
                session.userData.questions[1].Answers[0].Answer,
                session.userData.questions[1].Answers[1].Answer,
                session.userData.questions[1].Answers[2].Answer],
            {
                listStyle: builder.ListStyle.none,
                retryPrompt: (questionRetry)
            });
    },
    function (session, results) {
        var answer = session.userData.questions[1].Answers.find(function (item) {
            return (item.Answer == results.response.entity)
        });
        session.userData.score += answer.Flag;

        var heroCard = new builder.HeroCard(session)
            .title(`TERCERA PREGUNTA`)
            .subtitle(`Trivia Mundialista Rusia 2018 by Calltech S.A.`)
            .text(`${session.userData.questions[2].Statement}`)
            .images([
                builder.CardImage.create(session, session.userData.selectedSticker.URLImagenModificada)
            ])
            .buttons([
                builder.CardAction.imBack(session, session.userData.questions[2].Answers[0].Answer, `1) ${session.userData.questions[2].Answers[0].Answer}`),
                builder.CardAction.imBack(session, session.userData.questions[2].Answers[1].Answer, `2) ${session.userData.questions[2].Answers[1].Answer}`),
                builder.CardAction.imBack(session, session.userData.questions[2].Answers[2].Answer, `3) ${session.userData.questions[2].Answers[2].Answer}`)
            ]);
        var questionMessage = new builder.Message(session).addAttachment(heroCard);
        var questionRetry = new builder.Message(session).addAttachment(heroCard);;
        questionRetry.text(`Lo siento las preguntas son de selección múltiple, por favor selecciona una de las respuestas habilitadas para la siguiente pregunta: \n${session.userData.questions[2].Statement}`);
        builder.Prompts.choice(
            session,
            questionMessage,
            [
                session.userData.questions[2].Answers[0].Answer,
                session.userData.questions[2].Answers[1].Answer,
                session.userData.questions[2].Answers[2].Answer],
            {
                listStyle: builder.ListStyle.none,
                retryPrompt: (questionRetry)
            });
    },
    function (session, results) {
        var answer = session.userData.questions[2].Answers.find(function (item) {
            return (item.Answer == results.response.entity)
        });
        session.userData.score += answer.Flag;
        request({
            method: 'POST',
            url: 'http://181.48.138.26/FutBotDataBaseWebAPI/api/CrearMona',
            headers:
                {
                    'cache-control': 'no-cache',
                    'content-type': 'application/json'
                },
            body:
                {
                    contentType: session.userData.photo.contentType,
                    contentUrl: session.userData.photo.contentUrl,
                    name: session.userData.photo.name,
                    userName: session.userData.name
                },
            json: true
        }, function (error, response, body) {
            if (error) throw new Error(error);
            session.userData.mona = body;
            console.log(`Consuming the web service to create the Panini Sticker: \n${body}`);
            session.beginDialog('/showPaniniSticker');
        });
    }
]);
bot.dialog('/showPaniniSticker', [
    function (session, results) {
        
        var scoreHeroCard;
        switch (session.userData.score) {
            case 3:
                scoreHeroCard = new builder.HeroCard(session)
                    .title('¡Ganaste!')
                    .subtitle(`Tu puntaje: ${session.userData.score}/3`)
                    .text(` `)
                    .images([
                        builder.CardImage.create(session, 'http://www.calltechsa.com/wordpress/wp-content/uploads/2018/05/GANASTE.png')
                    ])
                    .buttons([
                        builder.CardAction.imBack(session, 'OK', 'OK')
                    ]);
                break;
            case 2:
                scoreHeroCard = new builder.HeroCard(session)
                    .title('¡Puedes mejorar!')
                    .subtitle(`Tu puntaje: ${session.userData.score}/3`)
                    .text(` `)
                    .images([
                        builder.CardImage.create(session, 'http://www.calltechsa.com/wordpress/wp-content/uploads/2018/05/SIGUE-PREPARANDOTE.png')
                    ])
                    .buttons([
                        builder.CardAction.imBack(session, 'OK', 'OK')
                    ]);
                break;
            default:
                scoreHeroCard = new builder.HeroCard(session)
                    .title('¡Perdiste!')
                    .subtitle(`Tu puntaje: ${session.userData.score}/3`)
                    .text(` `)
                    .images([
                        builder.CardImage.create(session, 'http://www.calltechsa.com/wordpress/wp-content/uploads/2018/05/PERDISTE.png')
                    ])
                    .buttons([
                        builder.CardAction.imBack(session, 'OK', 'OK')
                    ]);
                break;
        }

        var curiousHeroCard = new builder.HeroCard(session)
            .title(`Dato curioso`)
            .subtitle(session.userData.selectedSticker.NombreEtiqueta)
            .text(`Sabías que ${session.userData.selectedSticker.DatoCurioso}`)
            .images([
                builder.CardImage.create(session, session.userData.selectedSticker.URLImagen)
            ])
            .buttons([
                builder.CardAction.imBack(session, 'OK', 'OK')
            ]);

        var tarjetas = [scoreHeroCard, curiousHeroCard];
        var msj = new builder.Message(session).attachmentLayout(builder.AttachmentLayout.carousel).attachments(tarjetas);
        builder.Prompts.choice(session, msj, 'OK|OK', { listStyle: builder.ListStyle.none, retryPrompt: (msj) });
        // session.send(msj);
    },
    function (session, results) {

        request({
            method: 'POST',
            url: 'http://181.48.138.26/FutBotDataBaseWebAPI/api/Participantes',
            headers:
                {
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
            timeout: 120000,
            form:
                {
                    nombre: session.userData.name,
                    correo: session.userData.email,
                    url: session.userData.mona.url,
                    acumulado: session.userData.score,
                    descripcion: '15° Customer Experience Summit, Congreso Andino de Contact Center & CRM',
                    fotoCromo: session.userData.mona.FotoChromo
                }
        },
            function (error, response, body) {
                if (error) throw new Error(error);

                console.log(body);
            });

        var bye = (session.userData.score == 3) ?
            `${session.userData.name}, ya estas preparado para el mundial Rusia 2018 y quedaste inscrito en el sorteo de un balón del mundial ¡Gracias por Jugar!` :
            `¡Gracias por Jugar!`;

        var currentDate = new Date();

        var heroCard = new builder.HeroCard(session)
            .title(`${session.userData.name}`)
            .subtitle(`${currentDate.getFullYear()}`)
            .text(`${bye}`)
            .images([
                builder.CardImage.create(session, session.userData.mona.FotoChromo)
            ]);
        var msj = new builder.Message(session).addAttachment(heroCard);
        session.endDialog(msj);
    }
]);
bot.dialog('/selectSticker', [
    function (session) {
        var cards = [];
        for (var item in session.userData.ramdomStickers) {
            if (session.userData.ramdomStickers.hasOwnProperty(item)) {
                var heroCard = new builder.HeroCard(session)
                    .title(session.userData.ramdomStickers[item].NombreEtiqueta)
                    .subtitle(session.userData.ramdomStickers[item].Debut)
                    .text(`${session.userData.ramdomStickers[item].NombreEtiqueta} debutó con su selección nacional en el año ${session.userData.ramdomStickers[item].Debut} pesa ${session.userData.ramdomStickers[item].Peso} y mide ${session.userData.ramdomStickers[item].Estatura}`)
                    .images([
                        builder.CardImage.create(session, session.userData.ramdomStickers[item].URLImagenModificada)
                    ])
                    .buttons([
                        builder.CardAction.imBack(session, session.userData.ramdomStickers[item].NombreEtiqueta, `Seleccionar a ${session.userData.ramdomStickers[item].NombreEtiqueta}`)
                    ]);
                cards.push(heroCard);
            }
        }
        var reply = new builder.Message(session)
            .attachmentLayout(builder.AttachmentLayout.carousel)
            .attachments(cards)
            .text(`¿De cúal personaje de fútbol quieres aprender?`);
        var retry = new builder.Message(session)
            .attachmentLayout(builder.AttachmentLayout.carousel)
            .attachments(cards)
            .text(`Lo siento ${session.userData.name}, lo que escribiste no es un jugador valido para seleccionar. Vamos a intentarlo de nuevo.`);
        builder.Prompts.choice(
            session,
            reply,
            [session.userData.ramdomStickers[0].NombreEtiqueta, session.userData.ramdomStickers[1].NombreEtiqueta, session.userData.ramdomStickers[2].NombreEtiqueta],
            {
                listStyle: builder.ListStyle.none,
                retryPrompt: (retry)
            });
    },
    function (session, results) {
        session.userData.selectedSticker = session.userData.ramdomStickers.find(function (item) {
            return (item.NombreEtiqueta == results.response.entity);
        });

        if (session.userData.selectedSticker) {
            var heroCard = new builder.HeroCard(session)
                .title(session.userData.selectedSticker.NombreEtiqueta)
                .subtitle(session.userData.selectedSticker.Debut)
                .text(`Te haremos tres preguntas sobre ${session.userData.selectedSticker.NombreEtiqueta}`)
                .images([
                    builder.CardImage.create(session, session.userData.selectedSticker.URLImagenModificada)
                ])
                .buttons([
                    builder.CardAction.imBack(session, 'A Jugar', 'A Jugar')
                ]);

            var reply = new builder.Message(session).addAttachment(heroCard);
            builder.Prompts.choice(
                session,
                reply,
                ['A Jugar'],
                {
                    listStyle: builder.ListStyle.none,
                    retryPrompt: (reply)
                });
            // session.endDialog();
        }
    }
]);
bot.dialog('/askEmail', [
    function (session) {
        builder.Prompts.text(session, `${session.userData.name}, ¿Cúal es tu correo electrónico?`);
    },
    function (session, results) {
        if (emailvalidator.validate(results.response)) {
            session.userData.email = results.response;
            session.endDialogWithResult(results);
        } else {
            session.send(`Lo siento ${session.userData.name}, ${results.response} no es una dirección de correo valida. Vamos a intentarlo de nuevo.`);
            session.beginDialog('/askEmail');
        }
    }
]);
// Request file with Authentication Header
var requestWithToken = function (url) {
    return obtainToken().then(function (token) {
        return request({
            url: url,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/octet-stream'
            }
        });
    });
};

// Promise for obtaining JWT Token (requested once)
var obtainToken = Promise.promisify(connector.getAccessToken.bind(connector));

var checkRequiresToken = function (message) {
    return message.source === 'skype' || message.source === 'msteams';
};
