import axios from 'axios';
import type { Theme, Block } from '../types/editor';
import { withRelatedProject } from '@vercel/related-projects';
import type { 
    LoginData, 
    RegisterData, 
    DeleteData,
    AuthResponse,
    EmailVerificationResponse,
    PasswordResetResponse,
    VerifyEmailResponse
} from './api.types';

const baseURL = withRelatedProject({
    projectName: 'amped-bio-server',
    defaultHost: 'http://localhost:3000'
});

// Create an Axios instance with default configuration
const api = axios.create({
    baseURL: `${baseURL}/api`,
});

// Helper function to handle API errors consistently
async function apiRequest<T>(
    requestFn: () => Promise<any>,
    successMessage: string
): Promise<T> {
    try {
        const response = await requestFn();
        console.log(successMessage, response.data);
        return response.data;
    } catch (error) {
        console.error(`API Error: ${successMessage}`, error);
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data.message ?? error.message);
        } else {
            throw error;
        }
    }
}

// Authentication APIs
export async function login(authData: LoginData): Promise<AuthResponse> {
    return apiRequest<AuthResponse>(
        () => api.post('/auth/login', { data: authData }),
        'Login successful:'
    );
}

export async function registerNewUser(userData: RegisterData): Promise<AuthResponse> {
    return apiRequest<AuthResponse>(
        () => api.post('/auth/register', { data: userData }),
        'New User created successfully:'
    );
}

// Helper for POST requests with email parameter
async function emailBasedPostRequest<T>(endpoint: string, email: string, successMessage: string): Promise<T> {
    return apiRequest<T>(
        () => api.post(endpoint, { email }),
        successMessage
    );
}

export async function resendEmailVerification(email: string): Promise<EmailVerificationResponse> {
    return emailBasedPostRequest<EmailVerificationResponse>(
        '/auth/sendEmailVerification', 
        email,
        'Verification email sent:'
    );
}

export async function passwordResetRequest(email: string): Promise<PasswordResetResponse> {
    return emailBasedPostRequest<PasswordResetResponse>(
        '/auth/passwordResetRequest', 
        email,
        'Password reset email sent:'
    );
}

export async function resendVerificationEmail(email: string): Promise<EmailVerificationResponse> {
    return emailBasedPostRequest<EmailVerificationResponse>(
        '/auth/sendEmailVerification', 
        email,
        'Email verification resent:'
    );
}

export async function requestPasswordReset(email: string): Promise<PasswordResetResponse> {
    return emailBasedPostRequest<PasswordResetResponse>(
        '/auth/passwordResetRequest', 
        email,
        'Password reset request response:'
    );
}

// These endpoints still use GET as they are retrieving information, not performing actions
export async function verifyEmail(token: string, email: string): Promise<VerifyEmailResponse> {
    return apiRequest<VerifyEmailResponse>(
        () => api.get(`/auth/verifyEmail/${token}?email=${encodeURIComponent(email)}`),
        'Email verification response:'
    );
}

export async function processPasswordReset(token: string, password: string, confirmPassword: string): Promise<PasswordResetResponse> {
    return apiRequest<PasswordResetResponse>(
        () => api.post('/auth/passwordReset', {
            token,
            password,
            confirmPassword
        }),
        'Password reset response:'
    );
}

// User APIs
export async function editUser(userData: { id: number; name: string; email: string; onelink: string; description: string; image: string; reward_business_id: string; theme: string; }) {
    const { id } = userData;
    console.log('Editing user:', userData);
    return apiRequest(
        () => api.put(`/user/${id}`, { data: userData }),
        'User updated successfully:'
    );
}

export async function getUser(userData: { id: string; token: string; }) {
    const { id } = userData;
    console.log('Get user:', userData);
    return apiRequest<any>(
        () => api.get(`/user/${id}`, { 
            data: userData, 
            headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': '0' } 
        }),
        'User get:'
    ).then(data => data.result);
}

export async function deleteUser(userData: DeleteData) {
    const { id, password } = userData;
    return apiRequest(
        () => api.delete(`/user/${id}`, { data: { password } }),
        'User deleted successfully:'
    );
}

// Theme and Block APIs
export async function editTheme(theme: Theme, user_id: any) {
    const { id } = theme;
    console.log('Editing Theme:', id);
    return apiRequest(
        () => api.put(`/user/theme/${id}`, { data: { theme, user_id } }),
        'Theme updated successfully:'
    );
}

export async function editBlocks(blocks: Block[], user_id: any) {
    console.log('Editing user blocks:', user_id);
    return apiRequest(
        () => api.put(`/user/blocks/${user_id}`, { data: { blocks } }),
        'User updated successfully:'
    );
}

export async function deleteBlock(block_id: number, user_id: number) {
    console.log('Delete user block:', user_id);
    return apiRequest(
        () => api.delete(`/user/blocks/block/${block_id}$${user_id}`),
        'Block deleted successfully:'
    );
}

// Onelink APIs
export async function getOnelink(onelink: string) {
    console.log('Get onelink:', onelink);
    return apiRequest<any>(
        () => api.get(`/onelink/${onelink}`),
        'Onelink retrieved successfully:'
    ).then(data => data.result);
}

export async function checkOnelinkAvailability(onelink: string) {
    console.log('Check onelink:', onelink);
    return apiRequest<any>(
        () => api.get(`/onelink/check/${onelink}`),
        'Onelink availability checked:'
    ).then(data => data.message);
}