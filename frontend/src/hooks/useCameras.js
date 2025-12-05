import { useState, useEffect } from 'react';
import { api } from '../services/api';

export const useCameras = () => {
    const [cameras, setCameras] = useState([]);

    const fetchCameras = async () => {
        try {
            const res = await api.get('/cameras');
            setCameras(res.data);
        } catch (err) { console.error(err); }
    };

    const addCamera = async (camData) => {
        await api.post('/cameras', camData);
        fetchCameras();
    };

    const toggleCamera = async (id, currentStatus) => {
        // 1. Determine new status
        const newStatus = currentStatus === 'Active' ? 'Stopped' : 'Active';
        
        // 2. Optimistic Update (Immediate UI change)
        setCameras(prev => prev.map(cam => 
            cam._id === id ? { ...cam, status: newStatus } : cam
        ));

        try {
            // 3. Send to Backend
            await api.patch(`/cameras/${id}/status`, { status: newStatus });
            // 4. Double check consistency
            fetchCameras(); 
        } catch (error) {
            console.error("Failed to toggle camera", error);
            // Revert on error
            fetchCameras();
        }
    };

    const deleteCamera = async (id) => {
        await api.delete(`/cameras/${id}`);
        fetchCameras();
    };

    useEffect(() => { fetchCameras(); }, []);

    return { cameras, addCamera, toggleCamera, deleteCamera };
};