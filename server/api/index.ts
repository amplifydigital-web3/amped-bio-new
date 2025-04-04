import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { authController } from '../src/controllers/auth.controller';
import { userController } from '../src/controllers/user.controller';
import { validateUserInput } from '../src/middleware/validation';
import { themeController } from '../src/controllers/theme.controller';
import { blockController } from '../src/controllers/block.controller';
import { onelinkController } from '../src/controllers/onelink.controller';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'cache-control', 'expires', 'pragma'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all('*', (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../src/views'));

app.get('/', (req, res) => res.send('Express on Vercel'));

// Auth
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);

// Password Reset
app.post('/api/auth/passwordResetRequest', authController.passwordResetRequest);
app.post('/api/auth/passwordReset', authController.processPasswordReset);

// Email Verification
app.post('/api/auth/sendEmailVerification', authController.sendVerifyEmail);
app.get('/api/auth/verifyEmail/:token', authController.verifyEmail);

// User
app.put('/api/user/:id', validateUserInput, userController.edit);
app.get('/api/user/:id', userController.get);
app.delete('/api/user/:id', validateUserInput, userController.delete);

// Theme
app.put('/api/user/theme/:id', themeController.editTheme);
app.get('/api/user/theme/id', themeController.get);
app.delete('/api/user/theme/id', themeController.delete);

// Blocks
app.put('/api/user/blocks/:user_id', blockController.editBlocks);
app.get('/api/user/blocks/:user_id', blockController.getAll);
app.get('/api/user/blocks/block/:id', blockController.get);
app.delete('/api/user/blocks/block/:id', blockController.delete);

// Onelink
app.get('/api/onelink/:onelink', onelinkController.getOnelink);
app.get('/api/onelink/check/:onelink', onelinkController.checkOnelink);


// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

module.exports = app;
