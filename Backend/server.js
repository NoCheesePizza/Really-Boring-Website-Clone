const WebSocket = require("ws");
const fs = require("fs");

// server data
const wss = new WebSocket.Server({ port: 8080 });
const players = new Map(); // id (string) to { username, score, deltaScore, isNew }
const sockets = new Map(); // id to ws
const dcedPlayers = new Map(); // same as above
const callbacks = new Map();
let leaderId = "";

// fixed data 
const questions1 = fs.readFileSync("questions1.txt", "utf-8").split("\n").map(line => line.trim());
const questions2 = fs.readFileSync("questions2.txt", "utf-8").split("\n").map(line => line.trim());

// (start - QXYZ, contain - JKQXZ) -> <1% usage according to wikipedia (but can override if "any" not selected)
const startList = [];
const containsList = [];
const startToExclude = [ "Q", "X", "Y", "Z" ];
const containsToExclude = [ "J", "K", "Q", "X", "Z" ];

for (let i = 65; i < 90; ++i) {
    const char = String.fromCharCode(i);
    if (!startToExclude.includes(char)) {
        startList.push(char);
    }
    if (!containsToExclude.includes(char)) {
        containsList.push(char);
    }
}

/*
    0: letter (0 == "any")
    1: duration ((i + 1) * 10)
    2: number of questions (i + 1)
    3: show usernames (0 == true, 1 == false)
    4: type
    5: letterType (not from client)
*/
let config = [0, 11, 11, 0, 0, 0];
let phase = 0; // 0 == home, 1 == answering, 2 == voting

// send updated player info to everyone
function sendPlayerInfo() {
    players.forEach((value, key) => {
        sockets.get(key).send(JSON.stringify({ header: "players", body: { info: Array.from(players.entries()), leaderId }}));
    });
} 

function sendConfigInfo() {
}

// if websocket is given, then only transit for that guy
function transit(ws) {
    switch (to) {
        // to home page
        case 0:
            break;

        // to answering page
        case 1:
            break;

        // to voting page
        case 2:
            break;
    }
}

// new player joined
callbacks.set("enter", ({ id, username, score }) => {
    if (players.size == 0) {
        leaderId = id;
    }

    // check if newly joined player was previously disconnected
    if (dcedPlayers.has(id)) {
        const player = dcedPlayers.get(id);
        players.set(id, { username: player.username, score: player.score, deltaScore: player.deltaScore, isNew: player.isNew });
        dcedPlayers.delete(id);
    } else {
        players.set(id, { username, score, deltaScore: 0, isNew: true });
    }

    if (phase == 0) {
        sendPlayerInfo();
    }
});

// player changed username
callbacks.set("rename", ({ username }) => {
    players.get(id).username = username;
    sendPlayerInfo();
});

// player changed config
// row refers to config type, column refers to config option
callbacks.set("config", ({ row, column }) => {
    config[row] = column;
    players.forEach((value, key) => {
        sockets.get(key).send(JSON.stringify({ header: "config", body: { values: config.slice(0, -1) }}));
    });
});

// reset all scores
callbacks.set("reset", ({}) => {
    players.forEach((value, key) => {
        value.score = 0;
        value.deltaScore = 0;
        value.isNew = true;
    });

    sendPlayerInfo();
});

callbacks.set("transit", ({ to }) => {
    transit();
});

wss.on("connection", ws => {
    let id = "";

    // received message
    ws.on("message", message => {
        const msg = JSON.parse(message);
        console.log(`received: ${msg.header}`);

        // first connection
        if (msg.header == "enter") {
            id = msg.body.id;
            sockets.set(id, ws);
            transit(ws);
        }

        callbacks.get(msg.header)(msg.body);
    });

    // record disconnected players
    ws.on("close", () => {
        console.log(`${id} disconnected`);
        const player = players.get(id);
        dcedPlayers.set(id, { username: player.username, score: player.score, deltaScore: player.deltaScore, isNew: player.isNew});
        players.delete(id);
        sockets.delete(id);

        // find new leader
        leaderId = players.keys().next().value ?? "";
    });
});