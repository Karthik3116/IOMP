import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { socket } from '../services/socket';

export const useReports = () => {
    const [reports, setReports] = useState([]);

    const fetchReports = async () => {
        try {
            const res = await api.get('/reports');
            setReports(res.data);
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        fetchReports();
        
        // Listen for real-time alerts
        socket.on('new_alert', (newReport) => {
            console.log("Real-time alert received:", newReport);
            setReports(prev => [newReport, ...prev]);
        });

        return () => socket.off('new_alert');
    }, []);

    return { reports };
};