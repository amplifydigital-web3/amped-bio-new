import axios from 'axios';
import type { Theme, Block } from '../types/editor';
import { withRelatedProject } from '@vercel/related-projects';

type loginData = {
    email: string;
    password: string;
};

type registerData = {
    onelink: string;
    email: string;
    password: string;
};

type deleteData = {
    id: string;
    password: string;
};

const baseURL = withRelatedProject({
    projectName: 'amped-bio-server',
    defaultHost: 'http://localhost:3000'
})
console.log(baseURL);
// const baseURL = env('API_URL');
// const baseURL = 'http://localhost:3000/api';



export async function login(authData: loginData) {
    try {
        const response = await axios.post(`${baseURL}/api/auth/login`, { data: authData });
        console.log('Login successful:', response.data);
        return response.data;
    } catch (error) {
        console.error('Login Error:', error);
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data.message ?? error.message);
        } else {
            throw error;
        }
    }
};

// Add New User
export async function registerNewUser(userData: registerData) {
    try {
        const response = await axios.post(`${baseURL}/api/auth/register`, { data: userData });
        console.log('New User created successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error creating user:', error);
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data.message ?? error.message);
        } else {
            throw error;
        }
    }
};

// Edit User
export async function editUser(userData: { id: string; name: string; email: string; onelink: string; description: string; image: string; reward_business_id: string; }) {
    const { id } = userData;
    console.log('Editing user:', userData);
    try {
        const response = await axios.put(`${baseURL}/api/user/${id}`, { data: userData });
        console.log('User updated successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error updating user:', error);
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data.message ?? error.message);
        } else {
            throw error;
        }
    }
};

// Get User
export async function getUser(userData: { id: string; token: string; }) {
    const { id } = userData;
    console.log('Get user:', userData);
    try {
        const response = await axios.get(`${baseURL}/api/user/${id}`, { data: userData, headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Expires': 0 } });
        console.log('User get:', response.data);
        return response.data.result;
    } catch (error) {
        console.error('Error fetching user:', error);
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data.message ?? error.message);
        } else {
            throw error;
        }
    }
};

// delete User
export async function deleteUser(userData: deleteData) {
    const { id, password } = userData;
    try {
        const response = await axios.delete(`${baseURL}/api/user/${id}`, { data: { password } });
        console.log('User deleted successfully:', response.data);
    } catch (error) {
        console.error('Error deleting user:', error);
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data.message ?? error.message);
        } else {
            throw error;
        }
    }

};

// Edit Theme
export async function editTheme(theme: Theme, user_id) {
    const { id } = theme;
    console.log('Editing Theme:', id);
    try {
        const response = await axios.put(`${baseURL}/api/user/theme/${id}`, { data: { theme, user_id } });
        console.log('Theme updated successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error updating Theme:', error);
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data.message ?? error.message);
        } else {
            throw error;
        }
    }
};

// Edit Block
export async function editBlocks(blocks: Block[], user_id) {
    console.log('Editing user blocks:', user_id);
    try {
        const response = await axios.put(`${baseURL}/api/user/blocks/${user_id}`, { data: { blocks: blocks } });
        console.log('User updated successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error updating user:', error);
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data.message ?? error.message);
        } else {
            throw error;
        }
    }
};

// Delete Block
export async function deleteBlock(block_id, user_id) {
    console.log('Delete user block:', user_id);
    try {
        const response = await axios.delete(`${baseURL}/api/user/blocks/block/${block_id}$${user_id}`);
        console.log('Block deleted successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error deleting block:', error);
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data.message ?? error.message);
        } else {
            throw error;
        }
    }
};

// Get Onelink
export async function getOnelink(onelink: string) {
    console.log('Get onelink:', onelink);
    try {
        const response = await axios.get(`${baseURL}/api/onelink/${onelink}`);
        return response.data.result;
    } catch (error) {
        console.error('Error fetching user:', error);
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data.message ?? error.message);
        } else {
            throw error;
        }
    }
};

export async function checkOnelinkAvailability(onelink: string) {
    console.log('Check onelink:', onelink);
    try {
        const response = await axios.get(`${baseURL}/api/onelink/check/${onelink}`);
        return response.data.message;
    } catch (error) {
        console.error('Error checking URL:', error);
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data.message ?? error.message);
        } else {
            throw error;
        }
    }
}