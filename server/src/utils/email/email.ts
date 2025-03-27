import axios from 'axios';
import ReactDOMServer from 'react-dom/server';
import { verifyEmailTemplate } from './VerifyEmailTemplate';
import { resetPasswordTemplate } from './ResetPasswordTemplate';
import { withRelatedProject } from '@vercel/related-projects';

// const baseURL = withRelatedProject({
//     projectName: 'amped-bio-server',
//     defaultHost: 'http://localhost:3000'
// })

const baseURL = process.env.VERCEL_URL || 'http://localhost:3000';

type EmailOptions = {
    to: string | string[];
    text_body?: string;
    html_body?: string;
    subject: string;
}

const sendEmail = async (options: EmailOptions) => {
    console.log('Sending email:', { to: options.to, subject: options.subject });
    return new Promise((resolve, reject) => {
        // Validate required options
        if (!process.env.SMTP2GO_API_KEY) {
            reject(new Error('API key is required'));
            return;
        }

        if (!options.to) {
            reject(new Error('Email subject is required'));
            return;
        }

        if (!options.text_body && !options.html_body) {
            reject(new Error('Either text_body or html_body is required'));
            return;
        }

        const recipients = Array.isArray(options.to) ? options.to : [options.to];
        const requestData = {
            api_key: process.env.SMTP2GO_API_KEY,
            sender: process.env.SMTP2GO_EMAIL,
            to: recipients,
            subject: options.subject,
            text_body: options.text_body || '',
            html_body: options.html_body || ''
        };
        const jsonData = JSON.stringify(requestData);
        const requestOptions = {
            url: 'https://api.smtp2go.com/v3/email/send',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(jsonData)
            },
            data: jsonData
        };

        const request = axios.request(requestOptions).then((res) => {
            console.log('Email request sent:', res.data);
            return res.data;
        }).catch((error) => {
            console.error(error);
            reject(new Error(`Request to SMTP2GO failed: ${error.message}`));
        });


        resolve(request);
    });
}

export const sendEmailVerification = async (email: string, token: string) => {
    const url = `${baseURL}/api/auth/verifyEmail/${token}?email=${encodeURIComponent(email)}`;
    const body = verifyEmailTemplate(url);
    return sendEmail({
        to: email,
        subject: 'Amped-Bio Email Verification',
        html_body: ReactDOMServer.renderToString(body),
    });
}

export const sendPasswordResetEmail = async (email: string, token: string) => {
    const url = `${baseURL}/api/auth/passwordReset/${token}?email=${encodeURIComponent(email)}`;
    const body = resetPasswordTemplate(url);
    return sendEmail({
        to: email,
        subject: 'Amped-Bio Password Reset',
        html_body: ReactDOMServer.renderToString(body),
    });
}
