//todo prevent players who joined while a game is ongoing to view

const WebSocket = require("ws");
const fs = require("fs");

// server data
const wss = new WebSocket.Server({ host: "0.0.0.0", port: process.env.port || 8080 });
const players = new Map(); // id (string) to { username, score, deltaScore, isNew, theme }
const sockets = new Map(); // id to ws
let dcedPlayers = new Map(); // same as above
const callbacks = new Map();

// fixed data  (include "Backend/" if running via vs code)
const questions1 = fs.readFileSync("questions1.txt", "utf-8").split("\n").map(line => {
    const question = line.split("#")[0].trim(); // Get text before first hash
    const tags = [...line.matchAll(/#([^#\n\r]+)/g)].map(m => m[1].trim()); // Find all that satisfy the format #<any number of at least 1 characters that are not newline, return or hash>
    return { question, tags };
});
const questions2 = fs.readFileSync("questions2.txt", "utf-8").split("\n").map(line => {
    const question = line.trim();
    const tags = [];
    return { question, tags};
});
const points = [-2, -1, 0, 1, 2];

// (start - QXYZ, contain - JKQXZ) -> <1% usage according to wikipedia (but can override if "any" not selected)
const startsList = [];
const containsList = [];
const startsToExclude = [ "Q", "X", "Y", "Z" ];
const containsToExclude = [ "J", "K", "Q", "X", "Z" ];

for (let i = 65; i < 90; ++i) {
    const char = String.fromCharCode(i);
    if (!startsToExclude.includes(char)) {
        startsList.push(char);
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
*/
let config = [0, 11, 11, 0, 0];

// game data
let leaderId = "";
let phase = 0; // 0 == home, 1 == answering, 2 == voting
let questions = [];
let letter = "A";
let letterType = 0; // contains but not start with once every 3 rounds (1 contains 2 start in that order)
let timer = 0;
let canGoNext = true; // prevent spamming of next button
let shldRestart = false; // whether to force quit

// player's data
let submissions = []; // array of array of { input, answer, votes, score, id, username } (for each question, for each answer)
let currQuestion = -1;
let submissionCount = 0; // count number of players who have submitted
let selectedOptions = []; // array of map of (id : array of index (0 == -2, 1 == -1, 2 == -0, 3 == +1, 4 == +2))

function sendMessage(header, body, id) {
    console.log(`sent: ${header}`);

    // send to all players
    if (id === undefined) {
        players.forEach((value, key) => {
            if (sockets.has(key)) {
                sockets.get(key).send(JSON.stringify({ header, body }));
            }
        });
    
    // send to specific player
    } else {
        if (sockets.has(id)) {
            sockets.get(id).send(JSON.stringify({ header, body }));
        }
    }
}

function countDown() {
    setTimeout(() => {
        --timer;

        // leader initiated a restart from answering page
        if (shldRestart && phase == 1) {
            phase = 0;
            sendMessage("transit", { to: phase });
            shldRestart = false;
            return;
        }

        // break recursion and ask clients for submission
        if (timer <= 0) {
            ++letterType; // % 3 == 0 means contains
            currQuestion = -1;
            submissionCount = 0;
            submissions = Array.from({ length: config[2] + 1 }, () => []);
            selectedOptions = Array.from({ length: config[2] + 1 }, () => new Map());
            
            selectedOptions.forEach((_, qIndex) => {
                players.forEach((value, key) => {
                    selectedOptions[qIndex].set(key, []);
                });
            });

            sendMessage("submit", {});

        // send new time value and recurse
        } else {
            sendMessage("tick", { timer });
            countDown();
        }
    }, 1000);
}

// if id is given, then only send data to that guy (check is done in sendMessage)
function sendData(id) {
    sendMessage("transit", { to: phase, leaderId }, id);

    switch (phase) {
        // home
        case 0:
            sendMessage("players", { info: Array.from(players.entries()), leaderId }, id);
            sendMessage("config", { values: config }, id);
            break;

        // answering
        case 1:
            sendMessage("questions", { questions, letter, letterType, type: config[4] }, id);
            break;

        // voting
        case 2:

            // send entire player info to determine how many needed to answer for each question in case someone dc's
            sendMessage("answers", { 
                question: questions[currQuestion], 
                number: currQuestion, 
                answerCount: config[2] + 1, 
                info: Array.from(players.entries()), 
                shldShowUsername: config[3] == 0, 
                answers: submissions[currQuestion],
                selectedOptions: Array.from(selectedOptions[currQuestion])
            }, id);
            break;
    }
}

function goNext() {

    // award actual points
    if (currQuestion != -1) {
        submissions[currQuestion].forEach(answer => {
            if (answer.score > 0) {
                if (players.has(answer.id)) {
                    ++players.get(answer.id).score;
                    ++players.get(answer.id).deltaScore;
                }
            }
        });
    }

    // last question
    if (currQuestion == config[2]) {
        phase = 0;
        sendMessage("transit", { to: phase });
    } else {
        ++currQuestion;
    }

    sendData();
    canGoNext = true;
}

// new player joined
callbacks.set("enter", ({ id, username, score, deltaScore, theme }) => {
    if (players.size == 0) {
        leaderId = id;
    }

    // check if newly joined player was previously disconnected
    if (dcedPlayers.has(id)) {
        const player = dcedPlayers.get(id);
        players.set(id, { username: player.username, score: player.score, deltaScore: player.deltaScore, isNew: player.isNew, theme: player.theme });
        dcedPlayers.delete(id);

        // readd votes back when dced player returns
        if (phase == 2 && selectedOptions[currQuestion].has(id)) {
            selectedOptions[currQuestion].get(id).forEach((option, index) => {
                if (option != -1) {
                    submissions[currQuestion][index].score += points[option]
                    ++submissions[currQuestion][index].votes;
                }
            });
        }

    } else {
        players.set(id, { username, score, deltaScore, isNew: true, theme });
    }

    // force everyone to redraw ui (leader might've been changed)
    sendData();
});

// player changed username
callbacks.set("rename", ({ username, id }) => {
    if (players.has(id)) {
        players.get(id).username = username;
        sendMessage("players", { info: Array.from(players.entries()), leaderId })
    }
});

// player changed config
// row refers to config type, column refers to config option
callbacks.set("config", ({ row, column }) => {
    config[row] = column;
    sendMessage("config", { values: config });
});

// reset all scores
callbacks.set("reset", ({}) => {
    players.forEach((value, key) => {
        value.score = 0;
        value.deltaScore = 0;
        value.isNew = true;
    });

    // remove memory of isNew for players not present
    dcedPlayers = new Map();
    sendMessage("players", { info: Array.from(players.entries()), leaderId })
});

callbacks.set("color", ({ theme, id }) => {
    if (players.has(id)) {
        players.get(id).theme = theme;
        sendMessage("players", { info: Array.from(players.entries()), leaderId });
    }
});

// will only receive from leader
callbacks.set("transit", ({ to }) => {

    // in case player somehow restarts at the last second and cause the next game to restart immediately instead
    shldRestart = false;
    
    // some weird bug when the same person joins on two tabs, quick fix to prevent breaking the game
    if ((phase + 1) % 3 != to) {
        return;
    }

    phase = to;
    
    switch (to) {
        // home
        case 0:
            break;

        // answering
        case 1:

            // prepare randomly selected questions
            questions = (config[4] == 0 ? questions1 : questions2).sort((a, b) => Math.random() - 0.5).slice(0, config[2] + 1).map(q => q.question);

            // any letter (server decides)
            if (config[0] == 0) {
                if (config[4] == 1 || letterType % 3 == 0) {
                    letter = containsList[Math.floor(Math.random() * containsList.length)];
                } else {
                    letter = startsList[Math.floor(Math.random() * startsList.length)];
                }

            // specific letter (client decided)
            } else {
                letter = String.fromCharCode(64 + config[0]); // 64 because [0] is any letter
            }

            timer = (config[1] + 1) * 10;
            sendMessage("tick", { timer });
            countDown();

            break;

        // voting (not hit, to trigger something after answering phase put it below in submit)
        case 2:

            break;
    }

    sendData();
});

callbacks.set("submit", ({ id, submission }) => {
    
    // technically if player quits during answering phase it won't even send this event anyway
    if (!players.has(id)) {
        return;
    }

    const username = players.get(id).username;

    // each answer: { input, answer, votes, score, id, username }
    submission.forEach(answer => {
        submissions[answer.index].push({ input: answer.input, answer: answer.answer, votes: 0, score: 0, id, username });
    });

    // go to next phase once everyone has submitted their answers
    if (++submissionCount == players.size) {
        phase = 2;

        // initialise each player's options to tally if they dc (should be in the same order as submissions)
        players.forEach((value, key) => {

            // reset delta score and isNew
            value.deltaScore = 0;
            value.isNew = false;

            submissions.forEach((question, qIndex) => {
                const selectedOption = selectedOptions[qIndex];

                question.forEach(_ => {
                    if (selectedOption.has(key)) {
                        selectedOption.get(key).push(-1); // -1 for unselected
                    }
                });
            });
        })

        goNext();
    }
});

// client clicks on a number to vote
// row == answer number, col == option number
callbacks.set("vote", ({ id, row, col }) => {
    if (!selectedOptions[currQuestion].has(id)) {
        return;
    }

    selectedOptions[currQuestion].get(id)[row] = col;
    let voteCounts = Array(submissions[currQuestion].length).fill(0);
    let scores = Array(submissions[currQuestion].length).fill(0);

    // count total votes and score for current question
    // for each player
    selectedOptions[currQuestion].forEach((value, key) => {
        
        // for each answer (index represents answer number)
        // don't count disconnected players' answers
        if (players.has(key)) {
            value.forEach((option, index) => {
                scores[index] += option == -1 ? 0 : points[option];
                voteCounts[index] += option != -1;
            });
        }
    });

    // update submissions
    const submission = submissions[currQuestion];
    for (let i = 0; i < scores.length; ++i) {
        submission[i].score = scores[i];
        submission[i].votes = voteCounts[i];
    }

    sendMessage("vote", { submission, info: Array.from(players.entries()) });
});

callbacks.set("next", ({}) => {
    if (canGoNext) {
        canGoNext = false;

        if (submissions[currQuestion].length == 0) {
            goNext();
        } else {
            sendMessage("next", {});
            setTimeout(() => goNext(), 1500);
        }
    }
});

callbacks.set("restart", ({}) => {
    shldRestart = true;
});

// entry point
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
        }
        
        callbacks.get(msg.header)(msg.body);

        // no need anymore, data is sent in the callback
        // players variable not accurate if do this above, but id needs to be set first
        // if (msg.header == "enter") {
            // sendData(id);
        // }
    });

    // record disconnected players
    ws.on("close", () => {
        console.log(`${id} disconnected`);

        if (players.has(id)) {
            
            // subtract votes from answers
            // in hindsight should've probably saved answers client side instead of server side but whatever no biggie
            if (phase == 2 && selectedOptions[currQuestion].has(id)) {
                selectedOptions[currQuestion].get(id).forEach((option, index) => {
                    if (option != -1) {
                        submissions[currQuestion][index].score -= points[option]
                        --submissions[currQuestion][index].votes;
                    }
                });
            }

            const player = players.get(id);
            dcedPlayers.set(id, { username: player.username, score: player.score, deltaScore: player.deltaScore, isNew: player.isNew, theme: player.theme });
            players.delete(id);
            sockets.delete(id);
        }

        // find new leader
        leaderId = players.keys().next().value ?? "";
        sendData();
    });
});
