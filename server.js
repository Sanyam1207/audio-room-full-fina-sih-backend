const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

// Create Express HTTP server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS enabled for development
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Handle a client joining a room
    socket.on('join-room', ({ roomId, username, role }) => {
        socket.join(roomId);
        socket.username = username;
        socket.role = role;

        const clients = io.sockets.adapter.rooms.get(roomId) || new Set();
        const otherUsers = Array.from(clients)
            .filter(id => id !== socket.id)
            .map(id => {
                const s = io.sockets.sockets.get(id);
                return { userId: id, username: s?.username || 'Unknown', role: s?.role || 'student' };
            });

        socket.emit('all-users', otherUsers);
        socket.to(roomId).emit('user-joined', { userId: socket.id, username, role });

        socket.on('disconnect', () => {
            socket.to(roomId).emit('user-left', socket.id);
        });
    });


    // Relay an SDP offer to the target peer
    socket.on('offer', (payload) => {
        io.to(payload.target).emit('offer', {
            sdp: payload.sdp,
            sender: socket.id
        });
    });

    // Relay an SDP answer to the target peer
    socket.on('answer', (payload) => {
        io.to(payload.target).emit('answer', {
            sdp: payload.sdp,
            sender: socket.id
        });
    });


    socket.on('mute-student', ({ target }) => {
        if (socket.username && socket.role === 'teacher') {
            io.to(target).emit('mute');
        }
    });

    socket.on('unmute-student', ({ target }) => {
        if (socket.username && socket.role === 'teacher') {
            io.to(target).emit('unmute');
        }
    });


    // Relay an ICE candidate to the target peer
    socket.on('ice-candidate', (payload) => {
        io.to(payload.target).emit('ice-candidate', {
            candidate: payload.candidate,
            sender: socket.id
        });
    });

    // Handle disconnects: notify peers in each room that this user left
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        socket.rooms.forEach((roomId) => {
            // Note: socket.rooms includes the socket.id room itself; safe to emit to same room
            socket.to(roomId).emit('user-left', socket.id);
        });
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
