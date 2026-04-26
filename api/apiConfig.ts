// ✅ CORRECT: Use HTTPS (Secure)
//export const API_URL = "https://presensure.presensure.pro/api"; 
export const API_URL = "http://192.168.1.216:8000/api";
export const FACE_API = "https://n3hbs-face-verify-api.hf.space/python";

import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

const apiService = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  timeout: 10000,
});

apiService.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem("token");
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.log("Error retrieving token:", error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default apiService;