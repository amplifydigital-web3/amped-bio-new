import axios from 'axios';

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

// const baseURL = env('API_URL');
const baseURL = 'http://localhost:3000/api';

export async function login(authData: loginData) {
    try {
        const response = await axios.post(`${baseURL}/auth/login`, { data: authData });
        console.log('Login successful:', response.data);
        return response.data;
    } catch (error) {
        console.error('Login Error:', error);
    }
};

// Add New User
export async function registerNewUser(userData: registerData) {
    try {
        const response = await axios.post(`${baseURL}/auth/register`, { data: userData });
        console.log('New User created successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error creating user:', error);
    }
};

// Edit User
export async function editUser(userData: { id: String; name: String; email: String; littlelink_name: String; littlelink_description: String; theme: any; image: any; reward_business_id: String; }) {
    const { id } = userData;
    try {
        const response = await axios.put(`${baseURL}/user/${id}`, { data: userData });
        console.log('User updated successfully:', response.data);
    } catch (error) {
        console.error('Error updating user:', error);
    }
};

// delete User
export async function deleteUser(userData: deleteData) {
    const { id, password } = userData;
    try {
        const response = await axios.delete(`${baseURL}/user/${id}`, { data: { password } });
        console.log('User deleted successfully:', response.data);
    } catch (error) {
        console.error('Error deleting user:', error);
    }

};
