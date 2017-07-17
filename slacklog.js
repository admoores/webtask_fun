"use latest";
const request = require('request');
const nodemailer = require('nodemailer');
const Promise = require('bluebird');


const getMessages = (token, channel, options) => {
  return new Promise((resolve, reject) => {
    request.post('https://slack.com/api/channels.history', {form: {token: token, channel: channel}}, (err, res, body) => {
      if(err) {
        reject(err);
      } else {
        resolve(body);
      }
    });
  });
}

const getUserEmail = (token, userID) => {
  return new Promise((resolve, reject) => {
    request.post('https://slack.com/api/users.profile.get', {form: {token: token, user: userID}}, (err, res, body) => {
      if(err) {
        reject(err);
      } else {
        resolve(body);
      }
    });
  });
}

const getUserNames = (token) => {
    return new Promise((resolve, reject) => {
    request.post('https://slack.com/api/users.list', {form: {token: token}}, (err, res, body) => {
      if(err) {
        reject(err);
      } else {
        let response = JSON.parse(body);
        if (response.ok) {
          var users = {};
          for (var member of response.members) {
            users[member.id] = member.name;
          }
          resolve(users);
        } else {
          reject('bad response');
        }
      }
    });
  });
}

const sendMail = (transporter, target, emailBody) => {
  let mailOptions = {
      from: '"Slack Logger" <slack.log.bot@gmail.com>',
      to: target,
      subject: 'Message log from ' + new Date().toJSON(),
      html: emailBody
  };
  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, function(error, info){
      if(error){
        reject(error);
      } else {
        resolve('Message Sent!');
      }
    });
  });
}

module.exports = (ctx, cb) => {
  let emailBody;
  let users;
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'slack.log.bot@gmail.com',
        pass: ctx.secrets.mail_bot_pass
    }
  });
  getUserNames(ctx.secrets.slack_key).then((res) => {
    users = res;
  }).then(() => {
    getMessages(ctx.secrets.slack_key, ctx.body.channel_id).then((res) => {
      let response;
      try {
        response = JSON.parse(res);
      } catch (e) {
        cb (null, {text: 'Error parsing response'});
        return 0;
      }
      if (!response.ok) {
        cb(null, {text: 'Error contacting Slack API'});
      } else {
        let messages = response.messages;
        emailBody = '<table border="1"><tr><th>Date Time Group</th><th>User</th><th>Message</th></tr>';

        for (var message of messages) {
          let dtg = new Date(message.ts * 1000).toJSON();
          let uname = message.subtype === 'bot_message' ? 'BOT' : users[message.user];
          emailBody += '<tr><td>' + dtg + '</td><td>' + uname + '</td><td>' + message.text + '</td></tr>'
        }
        emailBody += '</table>';
      }
    }).then(() => {
      getUserEmail(ctx.secrets.slack_key, ctx.body.user).then((res) => {
        let response;
        try {
          response = JSON.parse(res);
        } catch (e) {
          cb (null, {text: 'Error parsing response'});
          return 0;
        }
        sendMail(transporter, response.profile.email, emailBody).then(() => {
          cb(null, {text: 'message sent'})
        });
      });
    });
  });
}