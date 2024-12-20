// @ts-nocheck
import { json } from "@sveltejs/kit";
import { SMTP_USER, SMTP_PWD, SMTP_ENDPOINT, SMTP_TLS_PORT } from "$env/static/private";
import nodemailer from 'nodemailer';

//TODO: factor our relay
export async function relay(originEmail, subject, message) {
    let transporter = nodemailer.createTransport({
        host: SMTP_ENDPOINT,
        port: SMTP_TLS_PORT,
        secure: true, // use TLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PWD,
        },
    });
    
    transporter.verify(function (error, success) {
        if (error) {
            console.log(error);
        } else {
            console.log("Server is ready to take our messages");
        }
    });
    

    var mailMessage = {
        from: "info@ischlstrom.org",
        to: "info@ischlstrom.org",
        subject: subject,
        text: JSON.stringify(message)
    };

    await transporter.sendMail(mailMessage);


    let result = { message: "OK" };

    return json(result);
}

export async function relayContactForm(email, message) {


    let transporter = nodemailer.createTransport({
        host: SMTP_ENDPOINT,
        port: SMTP_TLS_PORT,
        secure: true, // use TLS
        auth: {
            user: SMTP_USER,
            pass: SMTP_PWD,
        },
    });
    
    transporter.verify(function (error, success) {
        if (error) {
            console.log(error);
        } else {
            console.log("Server is ready to take our messages");
        }
    });
    

    var mailMessage = {
        from: "info@ischlstrom.org",
        to: "info@ischlstrom.org",
        subject: "EEG Kontaktaufnahme von " + email,
        text: JSON.stringify(message)
    };

    await transporter.sendMail(mailMessage);


    let result = { message: "OK" };

    return json(result);

}
