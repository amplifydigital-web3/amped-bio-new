import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authController } from '../src/controllers/auth.controller';
import { userController } from '../src/controllers/user.controller';
import { validateUserInput } from '../src/middleware/validation';
import { themeController } from '../src/controllers/theme.controller';
import { blockController } from '../src/controllers/block.controller';
import { onelinkController } from '../src/controllers/onelink.controller';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: '*', allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

app.all('*', (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});


app.get('/', (req, res) => res.send('Express on Vercel'));


app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.post('/api/auth/password-reset', authController.passwordReset);
app.post('/api/auth/password-reset-request', authController.passwordResetRequest);

// Save user
app.put('/api/user/:id', validateUserInput, userController.edit);
// Get User
app.get('/api/user/:id', userController.get);
// Delete user
app.delete('/api/user/:id', validateUserInput, userController.delete);

// Edit Theme
app.put('/api/user/theme/:id', themeController.editTheme);
// Get Theme
app.get('/api/user/theme/id', themeController.get);
// delete Theme
app.delete('/api/user/theme/id', themeController.delete);

// Edit Blocks
app.put('/api/user/blocks/:user_id', blockController.editBlocks);
// Get All User Blocks
app.get('/api/user/blocks/:user_id', blockController.getAll);
// Get Block
app.get('/api/user/blocks/block/:id', blockController.get);
// Delete Block
app.delete('/api/user/blocks/block/:id', blockController.delete);

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
