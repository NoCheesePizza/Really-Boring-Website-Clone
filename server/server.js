const WebSocket = require("ws");
const axios = require("axios");
const cheerio = require("cheerio");
const http = require("http");
const url = require("url");

/*
    tags can be (from lowest to highest priority):
    - unchecked: excluded
    - ticked: included (default option)
    - crossed: force excluded
    questions with unchecked tags can be included if they have other tags that are ticked, and
    questions with ticked tags can be excluded if they have other tags that are crossed
    ^ tags with possibly repeated questions are stored as a map for logical purposes, which
    are then unioned and differenced whenever the tag options are changed
    ^ tags with tag objects are also tracked for rendering purposes

    questions can be (from lowest to highest priority):
    - unchecked: follow tags' rule (unavailable for type 2, default option for type 1)
    - ticked: force included (default option for type 2)
    - crossed: force excluded (same priority as ticked because no conflict of interests)
    ^ ticked and crossed questions are stored as a set for logical purposes
    ^ question object in questionRepo (formerly questions1/2) also keeps track of this for rendering purposes
*/

const Option = Object.freeze({ UNCHECKED: 0, TICKED: 1, CROSSED: 2 });
let tagRepo = []; // { tag (string), option (enum) }
let questionRepo = [[], []]; // { question (string), tags (list), option (enum), isInPool (bool) }
let question1Map = new Map(); // map of tag (string) : questions (set)
let questionPool = [new Set(), new Set()]; // reconstructed whenever tag options change (not when questions option change)

// ticked and crossed questions guaranteed no overlap
let tickedQuestions = [new Set(), new Set()];
let crossedQuestions = [new Set(), new Set()];
let tickedTags = new Set();
let crossedTags = new Set();

async function pullQuestions(type) {
    if (type != 0 && type != 1) {
        return;
    }

    if (type == 0) {
        question1Map = new Map();
        tickedTags = new Set();
        crossedTags = new Set();
    }

    questionRepo[type] = [];
    questionPool[type] = new Set();
    tickedQuestions[type] = new Set();
    crossedQuestions[type] = new Set();

    try {
        const { data: html } = await axios.get("https://docs.google.com/document/d/e/" + (type == 0 ? 
            "2PACX-1vQBmAtv8p3bzHsJv8wHdsqwdAp_rAXw-8PMV2vWwaTvvkEe6AOCriE04BY4WoP681xo_advjQP_7oF2" :
            "2PACX-1vSFl8EhS7OlDklM4sLGLSh6SiLPrKlkc55IscpAXAI_B1BzaI4SShD5IeOGVBdqaTfVnQqm0DHiJH-S") + "/pub");
        const dom = cheerio.load(html);
        
        // swaps between c0 and c1
        (dom("span.c0").length == 0 ? dom("span.c1") : dom("span.c0")).each((index, element) => {
            const line = dom(element).text().trim();
            if (type == 0) {

                // Find all that satisfy the format #<any number of at least 1 characters that are not newline, return or hash>
                const question = line.split("#")[0].trim(); // Get text before first hash
                const tags = [...line.matchAll(/#([^#\n\r]+)/g)].map(m => m[1].trim());
                questionRepo[0].push({ question, tags, option: Option.UNCHECKED, isInPool: true });
                
                // add same question to various buckets
                for (const tag of tags) {

                    // haiz why can't [] insert if it doesn't exist like in cpp
                    if (!question1Map.has(tag)) {
                        question1Map.set(tag, new Set());
                        tagRepo.push({ tag, option: Option.TICKED });
                    }
                    question1Map.get(tag).add(question);
                }

            } else {
                const question = line.trim();
                const tags = [];
                questionRepo[1].push({ question, tags, option: Option.UNCHECKED, isInPool: true });
            }
        });
        
        // add all questions to pool whenever syncing with google docs
        questionPool[type] = new Set(questionRepo[type].map(entry => entry.question));
        
    } catch (error) {
        console.log(`Error pulling type ${type} questions: ${error}`);
    }
}

// only for type 1 (unless changed in the future)
function buildPoolFromTags() {
    
    // no tags, just add every question
    if (question1Map.size == 0) {
        questionPool[0] = new Set(questionRepo[0]);
    } else {
        questionPool[0] = new Set();
    }

    // set union
    tickedTags.forEach(tag => {
        questionPool[0] = questionPool[0].union(question1Map.get(tag));
    });

    // set difference (after union because exclusion has higher priority)
    crossedTags.forEach(tag => {
        questionPool[0] = questionPool[0].difference(question1Map.get(tag));
    });

    // no difference in order because ticked and crossed questions are mutually exclusive
    questionPool[0].union(tickedQuestions);
    questionPool[0].difference(crossedQuestions);

    // to grey out in ui
    questionRepo[0].forEach(entry => {
        entry.isInPool = questionPool.has(entry.question);
    });
}

pullQuestions(0);
pullQuestions(1);

// http server (which is reused for websocket)
const server = http.createServer((req, res) => {
    const key = `${req.method} ${url.parse(req.url, true).pathname}`;
    
    if (apis.has(key)) {
        apis.get(key)(req, res);
    } else {
        res.writeHead(404);
        res.end("endpoint does not exist");
    }
});

const apis = new Map(); // map of { method (get, post, put, delete, etc), path (/...) } : callback

apis.set("GET /test", (req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("works");
});

server.listen(process.env.port || 8080, "0.0.0.0", () => {
    console.log("started server");
});

// server data
const wss = new WebSocket.Server({ server });
const players = new Map(); // id (string) to { username, score, deltaScore, isNew, theme }
const sockets = new Map(); // id to ws
let dcedPlayers = new Map(); // same as above
const callbacks = new Map();

// fixed data  (include "Backend/" if running via vs code)
// const questions2 = fs.readFileSync("questions2.txt", "utf-8").split("\n").map(line => {
//     const question = line.trim();
//     const tags = [];
//     return { question, tags };
// });
const points = [-2, -1, 0, 1, 2];

// (start - QXYZ, contain - JKQXZ) -> <1% usage according to wikipedia (but can override if "any" not selected)
const startsList = [];
const containsList = [];
const startsToExclude = [ "J", "K", "Q", "X", "Y", "Z" ];
const containsToExclude = [ "J", "K", "Q", "X", "Y", "Z" ];

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
    4: type (i, but for rendering is i + 1)
*/
let config = [0, 11, 11, 0, 0];
const Config = Object.freeze({ LETTER: 0, DURATION: 1, QUESTIONS: 2, USERNAME: 3, TYPE: 4 }); // enum

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
            submissions = Array.from({ length: config[Config.QUESTIONS] + 1 }, () => []);
            selectedOptions = Array.from({ length: config[Config.QUESTIONS] + 1 }, () => new Map());
            
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
            sendMessage("questions", { questions, letter, letterType, type: config[Config.TYPE] }, id);
            break;

        // voting
        case 2:

            // send entire player info to determine how many needed to answer for each question in case someone dc's
            sendMessage("answers", { 
                question: questions[currQuestion], 
                number: currQuestion, 
                answerCount: config[Config.QUESTIONS] + 1, 
                info: Array.from(players.entries()), 
                shldShowUsername: config[Config.USERNAME] == 0, 
                answers: submissions[currQuestion],
                selectedOptions: Array.from(selectedOptions[currQuestion]),
                isType2: config[Config.TYPE] == 1
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
    if (currQuestion == config[Config.QUESTIONS]) {
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
            questions = (questionRepo[config[Config.TYPE]]).sort((a, b) => Math.random() - 0.5).slice(0, config[Config.QUESTIONS] + 1).map(q => q.question);

            // any letter (server decides)
            if (config[Config.LETTER] == 0) {
                if (config[Config.TYPE] == 1 || letterType % 3 == 0) {
                    letter = containsList[Math.floor(Math.random() * containsList.length)];
                } else {
                    letter = startsList[Math.floor(Math.random() * startsList.length)];
                }

            // specific letter (client decided)
            } else {
                letter = String.fromCharCode(64 + config[Config.LETTER]); // 64 because [0] is any letter
            }

            timer = (config[Config.DURATION] + 1) * 10;
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

callbacks.set("tag", ({ index, option }) => {
    if (index > -1 && index < tagRepo.length) {
        tagRepo[index].option = option; // for ui

        const tag = tagRepo[index].tag;
        tickedTags.delete(tag);
        crossedTags.delete(tag);

        // for logic
        if (option == Option.TICKED) {
            tickedTags.add(tag);
        } else if (option == Option.CROSSED) {
            crossedTags.add(tag);
        }

        buildPoolFromTags();
    }
});

// type == 0 (type 1) or 1 (type 2)
callbacks.set("question", ({ type, index, option }) => {
    if ((type == 1 || type == 2) && (index > -1 && index < questionRepo[type].length)) {
        questionRepo[type][index].option = option; // for ui

        // for logic
        const question = questionRepo[type][index].question;
        crossedQuestions[type].delete(question);
        tickedQuestions[type].delete(question);

        if (option == Option.TICKED) {
            tickedQuestions[type].add(question);
            questionPool[type].add(question);
            questionRepo[type][index].isInPool = true;

        } else if (option == Option.CROSSED) {
            crossedQuestions[type].add(question);
            questionPool[type].delete(question);
            questionRepo[type][index].isInPool = false;

        // unchecked, which only applies to type 1
        } else {
            buildPoolFromTags();
        }
    }
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
