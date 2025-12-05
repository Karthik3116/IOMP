import axios from 'axios';

const API_BASE = "http://localhost:4000/api";
const STREAM_BASE = "http://localhost:5000/stream";
export const IMAGE_BASE = "http://localhost:4000/captures/";

export const api = axios.create({ baseURL: API_BASE });

export const getStreamUrl = (url, name) => 
    `${STREAM_BASE}?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;

export const scanNetwork = async () => {
    const res = await api.post('/cameras/scan');
    return res.data;
};