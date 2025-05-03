import { AxiosRequestConfig } from 'axios';
import axios from 'axios';

// Create a pre-configured axios client with Basic Auth
const client = axios.create({
  baseURL: 'https://api.gong.io',
  auth: {
    username: process.env.GONG_ACCESS_KEY!,
    password: process.env.GONG_SECRET!
  }
});

export default client;

// Simple validation function for environment variables
export function validateGongAuth(): boolean {
  return !!process.env.GONG_ACCESS_KEY && !!process.env.GONG_SECRET;
} 