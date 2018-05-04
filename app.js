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
// var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
// var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector);
// Commented by Aldo to debbug 
// bot.set('storage', tableStorage);

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
        //builder.Prompts.choice(session, "What language do you code Node using?", ["JavaScript", "CoffeeScript", "TypeScript"]);
    },
    function (session, results) {
        //session.userData.photo.photo.url = `${results.response[0].contentUrl}`;
        session.userData.photoDownload = checkRequiresToken(session.message)
            ? requestWithToken(session.message.attachments[0].contentUrl)
            : request(session.message.attachments[0].contentUrl);

        session.send(`Mi misión es prepararte para el Mundial Rusia 2018.`);
        // Loading the Random Panini Stickers
        request({
            method: 'GET',
            url: 'http://localhost:41731/api/EtiquetasAleatorias',
            headers: {
                'Cache-Control': 'no-cache'
            }
        },
            function (error, response, body) {
                if (error) throw new Error(error);
                else {
                    session.userData.ramdomStickers = JSON.parse(body);
                    console.log(`Loading the ${session.userData.ramdomStickers.length} Random Panini Stickers: \n${body}`);
                }
            });
        session.beginDialog('/selectSticker');

        request({
            method: 'POST',
            url: 'http://localhost:41731/api/CreaPreguntas',
            headers:
                {
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json'
                },
            body: session.userData.selectedSticker,
            json: true
        }, function (error, response, body) {
            if (error) throw new Error(error);
            session.userData.questions = body;
            console.log(body);
        });

    },
    function (session, results) {
        session.endConversation('Gracias');
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
        //session.send(`¿De cúal personaje de fútbol quieres aprender?`);
        // session.send(reply);
        builder.Prompts.choice(
            session,
            reply,
            `${session.userData.ramdomStickers[0].NombreEtiqueta}|${session.userData.ramdomStickers[1].NombreEtiqueta}|${session.userData.ramdomStickers[2].NombreEtiqueta}`,
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
            session.endDialog(reply);
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