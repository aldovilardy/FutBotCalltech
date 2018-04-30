/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");
var emailvalidator = require("email-validator");

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
        session.beginDialog('/preguntarEmail');
    },
    function (session, results) {
        session.userData.email = results.response;
        builder.Prompts.attachment(session, `${session.userData.name}, envíame tu foto por favor.`, { contentTypes: 'image/*' });
        //builder.Prompts.choice(session, "What language do you code Node using?", ["JavaScript", "CoffeeScript", "TypeScript"]);
    },
    function (session, results) {
        session.userData.photoUrl = `${results.response[0].contentUrl}${results.response[0].name}`;
        session.send("Tengo estos datos... " + session.userData.name +
            " tu correo electronico es " + session.userData.email +
            " y la url de la imagen que me enviaste es " + session.userData.photoUrl);
    }
]);
bot.dialog('/preguntarEmail', [
    function (session) {
        builder.Prompts.text(session, `${session.userData.name}, ¿Cúal es tu correo electrónico?`);
    },
    function (session, results) {
        if (emailvalidator.validate(results.response)) {
            session.userData.email = results.response;
            session.endDialogWithResult(results);
        } else {
            session.send(`Lo siento ${session.userData.name}, ${results.response} no es una dirección de correo valida. Vamos a intentarlo de nuevo.`);
            session.beginDialog('/preguntarEmail');
        }
    }
]);
