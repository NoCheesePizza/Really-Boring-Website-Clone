//todo ------------ actual todos ------------ //

/*
    hard mode where you can only use each word once
    [done] enter to go to next wrong/empty input
    [done] if you minimise voting circle when it's red, it will be red when u maximise it somewhere else
    [done] refreshing questions page will reload user input (can just save words and validate all of them)
    [done] bug where unselecting answer doesnt update total score
    [done] banner only appears for the person who clicked next
    [done] only leader can click next
    [done] not only press enter to submit
    [done] cannot spam next
    [done - but spectator mode instead of blank screen] don't allow someone to join halfway (show blank screen)
    [nah] limit name length
    [done] test voting buttons
    [done] don't hard code top bars height
    [done] timer flashing
    [done] bug where capitalised words don't have similarity check
*/

//todo ------------ "global" ------------ //

const isPhone = window.matchMedia("only screen and (max-width: 600px)").matches;

//todo ------------ answering ------------ //

let chosenType = 0; // 0 => == 0 => type 1, == 1 => type 2
let chosenLetterType = 0; // % 3 != 0 => start with, % 3 == 0 => contain but not start with
let chosenLetter = "A";

let inputBorders = null;
let inputs = null;
let chosenAnswers = null;
let chosenQuestions = null;

// focus caret at end instead of start of line
function focusAtEnd(element) {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false); // false = to end
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function countChars(str, char) {
    let count = 0;
    for (const c of str) {
        if (c === char) {
            ++count;
        }
    }
    return count;
}

function setValidity(isValid, element) {
    if (isValid) {
        element.classList.add("valid");
        element.classList.remove("invalid");
    } else {
        element.classList.remove("valid");
        element.classList.add("invalid");
    }
}

function setUnanswered(element) {
    element.classList.remove("valid");
    element.classList.remove("invalid");
}

function checkValidity(index) {

    // (don't) remove leading and trailing whitespaces (here 'cos it will mess the cursor up)
    const element = inputs[index];
    let input = element.textContent;
    let playerInput = element.textContent;
    let isValid = true;

    input = input.trim().toLowerCase(); // don't override player's input with lowercase chars
    playerInput = playerInput.trim();

    // skip checking empty word
    if (input.length == 0) {
        
        // set other red answers possibly back to green
        // chosenAnswers[index].identicalIndices.forEach(value => {
        //     chosenAnswers[value].identicalIndices.delete(index);
        //     if (chosenAnswers[value].identicalIndices.size == 0) {
        //         setValidity(true, inputs[value]);
        //     }
        // });
        
        setUnanswered(element);
        chosenAnswers[index] = { input: "", answer: "", isValid: true /* , identicalIndices: new Set() */ };
        return;
    }

    // error checking
    let answer = input; // don't need new String(input) because...strings are primitives?? wtf?
    let playerAnswer = element.textContent; // not lowercase, send this to server but use lowercase (above) for error checking

    if (chosenType == 0) {
        if ((chosenLetterType % 3 != 0 && input[0] != chosenLetter) || 
        (chosenLetterType % 3 == 0 && (input[0] == chosenLetter || !input.includes(chosenLetter)))) {
            isValid = false;
        }

    } else {
        // word must appear at the front or back of the input
        const word = chosenQuestions[index];
        const indexOfWord = input.indexOf(word);
        if (indexOfWord == -1 || input.length == word.length || // word or non-word input doesn't exist
            (indexOfWord != 0 && indexOfWord != input.length - word.length)) { // word not at front and back of input
            isValid = false;
        }

        // input without word must not have spaces and must include the letter
        if (isValid) {
            answer = indexOfWord == 0 ? input.substring(word.length) : input.substring(0, input.length - word.length);
            answer = answer.trim();
            playerAnswer = indexOfWord == 0 ? playerInput.substring(word.length) : playerInput.substring(0, playerInput.length - word.length);
            playerAnswer = playerAnswer.trim();
            
            if (!answer.includes(chosenLetter) || answer.includes(" ")) {
                isValid = false;
            }
        }
    }

    /*
        const identicalIndices = chosenAnswers[index].identicalIndices;
        chosenAnswers.forEach((otherAnswer, otherIndex) => {
            if (otherAnswer.answer.length == 0 || index == otherIndex) {
                return;
            }

            // not self and same answer
            if (answer == otherAnswer.answer) {
                setValidity(false, inputs[otherIndex]);
                identicalIndices.add(otherIndex);
                chosenAnswers[otherIndex].identicalIndices.add(index);

            // different answer and used to be same
            } else if (answer != otherAnswer.answer && identicalIndices.has(otherIndex)) {
                identicalIndices.delete(otherIndex);
                chosenAnswers[otherIndex].identicalIndices.delete(index);
                
                // don't immediately set validity to true as doing so invalidates the previous letter checks
                if (chosenAnswers[otherIndex].identicalIndices.size == 0) {
                    setValidity(checkValidity(otherIndex), inputs[otherIndex]);
                }
            }
        });

        if (identicalIndices.size != 0) {
            isValid = false;
        }

        // normal for loop because forEach cannot break early
        for (let i = 0; i < inputs.length; ++i) {
            if (i != index && chosenAnswers[i].answer == playerAnswer) {
                isValid = false;
                break;
            }
        }
    */

    setValidity(isValid, element);
    chosenAnswers[index] = { input: playerInput, answer: playerAnswer, isValid /* , identicalIndices */ };
}

// technically can be done during checkValidity() but this is faster
function checkForDuplicates() {
    const identicalIndices = new Map(); // word to index (if key is not a primitive, has will do a reference not value check)

    chosenAnswers.forEach(({ answer, isValid }, index) => {
        if (identicalIndices.has(answer)) {
            setValidity(false, inputs[identicalIndices.get(answer)]);
            setValidity(false, inputs[index]);

        } else if (answer != "") {
            setValidity(isValid, inputs[index]); // set back to original validity
            identicalIndices.set(answer, index);
        }
    });
}

/*
    function checkValidityForAll() {
        inputs.forEach((_, index) => {
            checkValidity(index);
        });
        checkForDuplicates();
    }
*/

// next invalid or unanswered question, if any, to jump to when enter is pressed (tab will cycle between questions and arrow keys are self explanatory)
function findNextIndex(currIndex) {
    let newIndex = (currIndex + 1) % inputs.length; 
    while (true) {

        // no incomplete or invalid answers
        if (newIndex == currIndex) {
            return (newIndex + 1) % inputs.length;
        }

        // invalid or incomplete answer
        if (!inputs[newIndex].classList.contains("valid")) {
            return newIndex;
        }

        newIndex = (newIndex + 1) % inputs.length;
    }
}

function saveAllInputs() {
    const toSave = [];
    inputs.forEach(div => {
        toSave.push(div.textContent);
    });
    localStorage.setItem("rbw_inputs", JSON.stringify(toSave));
}

function addEventListenersAnswering() {
    
    // wtf .fill() fills them up with references, i swear why the fuck can't languages be explicit as to whether something is a reference like goated cpp
    // answer only used for type 2 for bracket and similarity check (if type 1, input == answer)
    inputs = document.querySelectorAll(".qInput");
    inputBorders = document.querySelectorAll(".qInputBorder");
    chosenAnswers = Array.from({ length: inputs.length }, () => ({ input: "", answer: "" /* , identicalIndices: new Set() */ }));

    const savedInputs = JSON.parse(localStorage.getItem("rbw_inputs"));
    if (savedInputs != null) {
        savedInputs.forEach((input, index) => {
            inputs[index].textContent = input;
            checkValidity(index);
        });
        checkForDuplicates();
    }

    // input override for enter, tab, up arrow, down arrow
    inputs.forEach((element, index) => {
        element.addEventListener("input", _ => {
            
            // save input on every keystroke, not just when clicking away or pressing the following keys
            if (document.activeElement === element) {
                checkValidity(index);
                checkForDuplicates();
                saveAllInputs();
            }
        });

        // growing/shrinking bottom border when input field is selected/unselected
        element.addEventListener("focus", _ => {
            inputBorders[index].style.width = isPhone ? "83%" : "100%";
        });
        element.addEventListener("blur", _ => {
            inputBorders[index].style.width = "0%";
        });

        // keydown is always 1 keystroke behind input, so need to separate the callbacks
        element.addEventListener("keydown", event => {
            if (event.key == "Enter" || event.key == "Tab" || event.key == "ArrowDown" || event.key == "ArrowUp") {
                event.preventDefault();
                element.textContent = element.textContent.trim();

                if (event.key == "Enter" || event.key == "Tab") {
                    focusAtEnd(inputs[findNextIndex(index)]);
                } else if (event.key == "ArrowDown") {
                    focusAtEnd(inputs[index == inputs.length - 1 ? 0 : index + 1]);
                } else {
                    focusAtEnd(inputs[index == 0 ? inputs.length - 1 : index - 1]);
                }
            }
        });
    });
}

//todo ------------ voting ------------ //

let circles = null;
let banners = null;
let selection = null;
let scores = null;
let voteCounts = null;
let yourAnswer = -1;
let canGoNext = true; // prevent people from spamming the button and messing up the UI (logic is handled server side)

// isFromJs == true => called by javascript (when player refreshes page and receives answers)
function moveCircleTo(row, col, isFromJs) {

    // selection will only be null if player joins during voting phase (can't click points but can go next if leader and spectate)
    if (selection == null) {
        return;
    }

    // account for offset in circle index because "your answer" row has no circle
    const pseudoRow = yourAnswer != -1 && row > yourAnswer ? row - 1 : row;
    
    // appear
    if (selection[row] == -1 || isFromJs) {
        circles[pseudoRow].style.width = isPhone ? "8vw" : "3vw";
        circles[pseudoRow].style.height = isPhone ? "8vw" : "3vw";
        circles[pseudoRow].style.transition = "box-shadow 0.5s ease, width 0.35s ease-in, height 0.35s ease-in, border-width 0.5s linear";

    // disappear
    } else if (col == selection[row]) {
        selection[row] = -1;
        circles[pseudoRow].style.width = "0vw";
        circles[pseudoRow].style.height = "0vw";
        sendMessage("vote", { id: myId, row, col: selection[row] });
        return;

    // move
    } else {
        circles[pseudoRow].style.transition = "box-shadow 0.5s ease, width 0.35s ease-in, height 0.35s ease-in, border-width 0.5s linear, left 0.5s cubic-bezier(0.8, 0, 0.2, 1)";
    }

    // set colour depending on value picked
    if (col < 3) {
        circles[pseudoRow].classList.remove("correct");
    } else {
        circles[pseudoRow].classList.add("correct");
    }

    if (isPhone) {
        circles[pseudoRow].style.left = (39 + 9.8 * col) + "%";
    } else {
        circles[pseudoRow].style.left = (2.5 + 14.5 * col) + "%";
    }

    selection[row] = col;
    sendMessage("vote", { id: myId, row, col: selection[row] });
}

function animateBanners() {
    banners.forEach(banner => {
        banner.style.display = "block"
        banner.style.animation = "none";
        banner.offsetHeight;
        banner.style.animation = "bannerPop 1.5s ease-out forwards";
    });
}

// click next button to show coloured banners 
function goNext(element, event) {
    if (canGoNext) {
        // server will send another call to animate banners
        canGoNext = false;
        event.stopPropagation();
        sendMessage("next", {});

        // next button animation
        element.style.animation = "none";
        element.offsetHeight;
        element.style.animation = "pulse 0.5s ease-out";
    }
}

function restartGame(event) {
    event.stopPropagation();
    sendMessage("restart", {});
}

function addEventListenersVoting() {
    circles = document.querySelectorAll(".circle");
    banners = document.querySelectorAll(".banner");
    scores = document.querySelectorAll(".aPoints");
    voteCounts = document.querySelectorAll(".aAnswered");
}

//todo ------------ home ------------ //

// fixed number of elements
const configArrows = document.querySelectorAll(".sValue");
const configMenus = document.querySelectorAll(".menu");
const configValues = Array(5).fill(0);
const menuIsClicked = Array(5).fill(false);
const configOptions = []; // list of lists of dom elements

function closeMenu(index) {
    configMenus[index].style.height = "0vw";
    configMenus[index].style.maxHeight = "0vw";
    configMenus[index].style.overflow = "hidden";
}

// thanks jippity
function hexToRgb(hex) {
    hex = hex.replace(/^#/, "");
    if (hex.length === 3) {
        hex = hex.split("").map(h => h + h).join("");
    }

    const num = parseInt(hex, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

// colour input
document.getElementById("color").addEventListener("input", event => {
    theme = event.target.value;
    const rgb = hexToRgb(event.target.value);
    document.documentElement.style.setProperty("--theme", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
});

// save color to local storage and send it to the server
document.getElementById("color").addEventListener("change", _ => {
    localStorage.setItem("rbw_theme", theme);
    sendMessage("color", { theme, id: myId });
});

// initialise configOptions
configMenus.forEach(menu => {
    const options = [];
    menu.querySelectorAll(".option").forEach(option => {
        options.push(option);
    });
    configOptions.push(options);
});

// click option to select it and close associated menu
// row refers to config type, column refers to config option
configOptions.forEach((config, row) => {
    config.forEach((element, column) => {
        element.addEventListener("click", () => {
            // configArrows[index].childNodes[0].textContent = element.textContent + " ";
            closeMenu(row);
            sendMessage("config", { row, column });
        });
    });
});

// press dropdown arrow to expand context menu
configArrows.forEach((element, index) => {
    element.addEventListener("click", () => {
        if (menuIsClicked[index]) {
            closeMenu(index);
            element.classList.remove("open");

        } else {
            // close every menu when opening a new menu
            for (let i = 0; i < configMenus.length; ++i) {
                closeMenu(i);
                menuIsClicked[i] = false;
            }

            // Temporarily set height to 'auto' to measure full height
            configMenus[index].style.display = "block"; // if it's hidden initially
            configMenus[index].style.height = "auto";
            // configMenus[index].style.paddingTop = "1vh";
            // configMenus[index].style.paddingBottom = "0vw";

            const fullHeight = configMenus[index].scrollHeight + "px";

            // Set back to 0, then animate to fullHeight
            configMenus[index].style.height = "0px";
            configMenus[index].offsetHeight; // force reflow

            configMenus[index].style.height = fullHeight;
            configMenus[index].style.maxHeight = isPhone ? "32.5vw" : "13.3vw";

            setTimeout(() => {
                configMenus[index].style.overflow = "auto";
            }, 500);

            element.classList.add("open");
        }

        menuIsClicked[index] = !menuIsClicked[index];
    });
});

// rename button
document.getElementById("rename").addEventListener("click", _ => {
    username = prompt("Enter your username:");
    username = username.trim(); // remove whitespaces
    if (username != null && username != "") { // if user presses cancel username will be null
        sendMessage("rename", { username, id: myId });
    }
});

// reset button
document.getElementById("resetGame").addEventListener("click", _ => {
    if (confirm("Are you sure you want to reset all scores?")) {
        sendMessage("reset", {});
    }
});

// start button
document.getElementById("startGame").addEventListener("click", _ => {
    sendMessage("transit", { to: 1 });
});

// view question bank button
function goToBank() {
    currTab = Tab.TAGS;

    document.getElementById("home").style.display = "none";
    document.getElementById("bank").style.display = "block";
    document.getElementById("tagsTab").click();
}

//todo ------------ server logic ------------ //

function genRandomString(length) {
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
}

function sendMessage(header, body) {
    if (isConnected) {
        console.log(`sent: ${header}`);
        socket.send(JSON.stringify({ header, body }));
    } else {
        console.warn(`attempted to send "${header}" while disconnected`);
    } 
}

// public endpoint: "wss://my-boring-website.onrender.com", private endpoint: "ws://localhost:8080"
const socket = new WebSocket("ws://localhost:8080");
const myId = localStorage.getItem("rbw_id") ?? genRandomString(32);
const callbacks = new Map();

let username = localStorage.getItem("rbw_username") ?? "New Player";
let score = localStorage.getItem("rbw_score") ?? 0;
let deltaScore = localStorage.getItem("rbw_deltaScore") ?? 0;
let theme = localStorage.getItem("rbw_theme") ?? "#32C8FA";

let playerCount = []; // for voting phase
let isLeader = false;
let isConnected = false; // check if socket is open before sending message

localStorage.setItem("rbw_id", myId);

{
    let rgb = hexToRgb(theme);
    document.documentElement.style.setProperty("--theme", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
}

document.getElementById("color").value = theme;

socket.addEventListener("open", () => {

    // join server
    isConnected = true;
    sendMessage("enter", { id: myId, username, score, deltaScore, theme });
});

socket.addEventListener("message", message => {
    const msg = JSON.parse(message.data);
    console.log(`received: ${msg.header}`);
    callbacks.get(msg.header)(msg.body);
});

// show loading page after 1 s if not connected
setTimeout(() => {
    if (!isConnected) {
        // document.getElementById("loading").style.display = "flex";
    }
}, 1000);

/*
    <div class="player">
        <div class="pName">Shishamo</div>
        <div class="pScoreAndDelta">
            <div class="pScore">5</div>
            <div class="pDelta"></div>
        </div>
    </div>
*/

// receive player list
callbacks.set("players", ({ info, leaderId }) => {
    const players = new Map(info);
    let highestScore = 0;
    let mostImprovedScore = 0;

    // find highest score and most improved score
    players.forEach((value, key) => {
        highestScore = value.score > highestScore ? value.score : highestScore;
        mostImprovedScore = value.deltaScore > mostImprovedScore ? value.deltaScore : mostImprovedScore;
    });
    
    // redraw player list
    const parentDiv = document.getElementById("players");
    parentDiv.innerHTML = "";

    // set self to leader
    if (leaderId == myId) {
        document.getElementById("startGame").style.display = "block";
        document.getElementById("resetGame").style.display = "block";

    // hide buttons if not leader
    } else {
        isLeader = false;
        document.getElementById("startGame").style.display = "none";
        document.getElementById("resetGame").style.display = "none";
    }

    // save stats to localStorage (no way players doesn't have myId)
    if (players.has(myId)) {
        const me = players.get(myId);
        localStorage.setItem("rbw_username", me.username);
        localStorage.setItem("rbw_score", me.score);
        localStorage.setItem("rbw_deltaScore", me.deltaScore);
    }

    // key: id, value: { username, score, deltaScore, isNew }
    players.forEach((value, key) => {
    
        const playerDiv = document.createElement("div");
        playerDiv.classList.add("player");
    
        const pNameDiv = document.createElement("div");
        pNameDiv.classList.add("pName");
        pNameDiv.textContent = value.username;
        pNameDiv.style.color = value.theme + "CC";

        if (myId == key) {
            pNameDiv.classList.add("you");
        }
        if (key == leaderId) {
            pNameDiv.classList.add("leader");
        }

        const pScoreAndDeltaDiv = document.createElement("div");
        pScoreAndDeltaDiv.classList.add("pScoreAndDelta");

        const pScoreDiv = document.createElement("div");
        pScoreDiv.classList.add("pScore");
        pScoreDiv.textContent = value.score;
        
        if (value.score == highestScore && !value.isNew) {
            pScoreDiv.classList.add("highest");
        }
        if (value.deltaScore == mostImprovedScore && !value.isNew) {
            pScoreDiv.classList.add("mostImproved");
        }

        const pDeltaDiv = document.createElement("div");
        pDeltaDiv.classList.add("pDelta");
        if (!value.isNew) {
            pDeltaDiv.textContent = `(+${value.deltaScore})`;
        }

        pScoreAndDeltaDiv.appendChild(pScoreDiv);
        pScoreAndDeltaDiv.appendChild(pDeltaDiv);

        playerDiv.appendChild(pNameDiv);
        playerDiv.appendChild(pScoreAndDeltaDiv);

        parentDiv.appendChild(playerDiv);
    });
});

// receive changed config
callbacks.set("config", ({ values }) => {
    values.forEach((column, row) => {
        configArrows[row].childNodes[0].textContent = configOptions[row][column].textContent + " ";
    });
});

// received signal to change phase
callbacks.set("transit", ({ to, leaderId }) => {
    const homeDiv = document.getElementById("home");
    const answeringDiv = document.getElementById("answering");
    const votingDiv = document.getElementById("voting");

    isLeader = myId == leaderId;
    document.getElementById("loading").style.display = "none";

    switch (to) {
        // home page
        case 0:
            answeringDiv.style.display = "none";
            votingDiv.style.display = "none";
            homeDiv.style.display = "block";
            localStorage.removeItem("rbw_inputs");
            // sendMessage("players config", { id });
            break;

        // answering page
        case 1:
            homeDiv.style.display = "none";
            votingDiv.style.display = "none";
            answeringDiv.style.display = "block";
            // sendMessage("questions", { id });
            break;

        // voting page
        case 2:
            homeDiv.style.display = "none";
            answeringDiv.style.display = "none";
            votingDiv.style.display = "block";
            localStorage.removeItem("rbw_inputs");
            // sendMessage("answers selected votes", { id });
            break;
    }
});

/*
    <div class="question">
        <div class="numAndContent">
            <div class="qNumber">01</div>
            <div class="qContent">head</div>
        </div>
        <div class="qInputGroup">
          <div class="qInput" contenteditable="true" tabindex="0"></div>
          <div class="qInputBorder"></div>
        </div>
    </div>
*/

callbacks.set("questions", ({ questions, letter, letterType, type }) => {
    chosenLetter = letter.toLowerCase();
    chosenLetterType = letterType;
    chosenType = type;
    chosenQuestions = questions;

    // hide restart button if not leader
    if (isLeader) {
        document.getElementById("restart").style.display = "block";
    } else {
        document.getElementById("restart").style.display = "none";
    }

    document.getElementById("minutes").classList.remove("flash");
    document.getElementById("seconds").classList.remove("flash");

    // set letter and instructions
    document.getElementById("bigLetter").textContent = letter;
    document.getElementById("instructions").textContent = "Please enter words or phrases that " +
        (type == 0
        ? (letterType % 3 == 0
        ? "contains but not start with"
        : "start with")
        : "contains")
        + " the letter \"" + letter + "\".";

    const parentDiv = document.getElementById("questions");
    parentDiv.innerHTML = "";

    // set questions
    questions.forEach((question, index) => {
        const questionDiv = document.createElement("div");
        questionDiv.classList.add("question");

        const numAndContentDiv = document.createElement("div");
        numAndContentDiv.classList.add("numAndContent");

        const qNumberDiv = document.createElement("div");
        qNumberDiv.classList.add("qNumber");
        qNumberDiv.textContent = String(index + 1).padStart(2, "0");

        const qContentDiv = document.createElement("div");
        qContentDiv.classList.add("qContent");
        qContentDiv.textContent = question;

        const qInputGroupDiv = document.createElement("div");
        qInputGroupDiv.classList.add("qInputGroup");

        const qInputDiv = document.createElement("div");
        qInputDiv.classList.add("qInput");
        qInputDiv.contentEditable = true;

        const qInputBorderDiv = document.createElement("div");
        qInputBorderDiv.classList.add("qInputBorder");

        numAndContentDiv.appendChild(qNumberDiv);
        numAndContentDiv.appendChild(qContentDiv);

        qInputGroupDiv.appendChild(qInputDiv);
        qInputGroupDiv.appendChild(qInputBorderDiv);

        questionDiv.appendChild(numAndContentDiv);
        questionDiv.appendChild(qInputGroupDiv);

        parentDiv.appendChild(questionDiv);
    });

    addEventListenersAnswering();
});

/*
    <div class="answer">
        <div class="banner correct">+1</div>
        <div class="aContent">
            <span class="aName">Kemalism:</span>knitting ability is a very long word or phrase
        </div>
        <div class="aRight">
            <div class="vote" onclick="moveCircleTo(0, 0)">-2</div>
            <div class="vote" onclick="moveCircleTo(0, 1)">-1</div>
            <div class="vote" onclick="moveCircleTo(0, 2)">-0</div>
            <div class="vote correct" onclick="moveCircleTo(0, 3)">+1</div>
            <div class="vote correct" onclick="moveCircleTo(0, 4)">+2</div>
            <div class="circle"></div>
            <div class="aPoints correct">+40</div>
            <div class="aAnswered">2/30</div>
        </div>
    </div>
*/

// answers = array of { input, answer, votes, score, id, username }
callbacks.set("answers", ({ question, number, answerCount, info, shldShowUsername, answers, selectedOptions, isType2 }) => {
    const players = new Map(info);

    // set question number and content
    document.getElementById("bigQNum").textContent = number + 1;
    document.getElementById("smallQNum").textContent = `of ${answerCount}`;
    document.getElementById("bigQContent").textContent = question;

    // hide next button if not leader
    if (isLeader) {
        document.getElementById("next").style.visibility = "visible";
    } else {
        document.getElementById("next").style.visibility = "hidden";
    }

    yourAnswer = -1;
    canGoNext = true;
    playerCount = []

    const parentDiv = document.getElementById("answers");
    parentDiv.innerHTML = "";

    selection = new Map(selectedOptions).get(myId);
    const toClick = []; // vector of { row, col }

    // for loop faster than filter / reduce / any fancy bullshit
    spectatorCount = 0;
    players.forEach((value, key) => {
        spectatorCount += value.isNew == true;
    });

    // render all answers
    answers.forEach(({ input, answer, votes, score, id, username }, index) => {
        const answerDiv = document.createElement("div");
        answerDiv.classList.add("answer");

        const bannerDiv = document.createElement("div");
        bannerDiv.classList.add("banner");
        bannerDiv.textContent = "+0";

        const aContentDiv = document.createElement("div");
        aContentDiv.classList.add("aContent");

        if (shldShowUsername) {
            const aNameSpan = document.createElement("span");
            aNameSpan.classList.add("aName");
            aNameSpan.textContent = `${username}:`;
            
            if (players.has(id)) {
                aNameSpan.style.color = players.get(id).theme + "CC";
            }

            aContentDiv.appendChild(aNameSpan);
        }

        // answer content varies between type 1 & 2
        aContentDiv.appendChild(document.createTextNode(isType2 ? `${input} (${answer})` : input));
        
        const aRightDiv = document.createElement("div");
        aRightDiv.classList.add("aRight");

        if (id == myId || selection == null) {
            const yourAnswerDiv = document.createElement("div");
            yourAnswerDiv.classList.add("yourAnswer");
            yourAnswerDiv.textContent = selection == null ? "YOU ARE SPECTATING" : "YOUR ANSWER";

            aRightDiv.appendChild(yourAnswerDiv);
            yourAnswer = index;

        } else {
            
            // draw -2 to 2 circles
            // <div class="vote" onclick="moveCircleTo(0, 0)">-2</div>
            const values = ["-2", "-1", "-0", "+1", "+2"];
            for (let i = 0; i < 5; ++i) {
                const voteDiv = document.createElement("div");
                voteDiv.classList.add("vote");
                voteDiv.onclick = () => moveCircleTo(index, i, false);
                voteDiv.textContent = values[i];
                aRightDiv.appendChild(voteDiv);
    
                if (selection[index] == i) {
                    toClick.push({ row: index, col: i });
                }
            }
    
            const circleDiv = document.createElement("div");
            circleDiv.classList.add("circle");

            aRightDiv.appendChild(circleDiv);
        }
        
        const aPointsDiv = document.createElement("div");
        aPointsDiv.classList.add("aPoints");
        aPointsDiv.textContent = `${(score < 1 ? "-" : "+")}${Math.abs(score)}`;
        
        // by default is red (ie no class == incorrect)
        if (score > 0) {
            bannerDiv.classList.add("correct");
            aPointsDiv.classList.add("correct");
        }
        
        const aAnsweredDiv = document.createElement("div");
        aAnsweredDiv.classList.add("aAnswered");
        const totalCount = players.size - spectatorCount - players.has(id);
        aAnsweredDiv.textContent = `${votes}/${totalCount}`; // account for dc or newly joined

        // conditional formatting when everyone has answered
        playerCount.push(totalCount);
        if (votes == totalCount) {
            aAnsweredDiv.classList.add("correct");
        }

        aRightDiv.appendChild(aPointsDiv);
        aRightDiv.appendChild(aAnsweredDiv);

        answerDiv.appendChild(aContentDiv);
        answerDiv.appendChild(aRightDiv);
        answerDiv.appendChild(bannerDiv);

        parentDiv.appendChild(answerDiv);
    });

    addEventListenersVoting();

    toClick.forEach(({ row, col }) => {
        moveCircleTo(row, col, true);
    });
});

callbacks.set("tick", ({ timer }) => {
    const minutes = Math.floor(timer / 60);
    const seconds = timer - minutes * 60;
    const minutesSpan = document.getElementById("minutes");
    const secondsSpan = document.getElementById("seconds");

    minutesSpan.textContent = String(minutes).padStart(2, "0");
    secondsSpan.textContent = String(seconds).padStart(2, "0");

    // flash theme color when time about to run out
    if (seconds < 10 && minutes == 0) {
        if (seconds % 2 == 0) {
            minutesSpan.classList.remove("flash");
            secondsSpan.classList.remove("flash");
        } else {
            minutesSpan.classList.add("flash");
            secondsSpan.classList.add("flash");
        }
    }
});

callbacks.set("submit", ({}) => {
    const submission = [];
    chosenAnswers.forEach(({ input, answer }, index) => {
        if (inputs[index].classList.contains("valid")) {
            submission.push({ input, answer, index });
        }
    });
    
    console.log(submission, chosenAnswers);
    sendMessage("submit", { id: myId, submission });
});

callbacks.set("vote", ({ submission, info }) => {
    const players = new Map(info);

    // each element in submission = { input, answer, votes, score, id, username }
    submission.forEach(({ input, answer, votes, score, id, username}, index) => {
        scores[index].textContent = `${(score < 1 ? "-" : "+")}${Math.abs(score)}`;
        const textContent = voteCounts[index].textContent;
        voteCounts[index].textContent = `${votes}/${playerCount[index]}`;

        if (votes == playerCount[index]) {
            voteCounts[index].classList.add("correct");
        } else {
            voteCounts[index].classList.remove("correct");
        }

        // scores & banners conditional formatting
        if (score > 0) {
            scores[index].classList.add("correct");
            banners[index].classList.add("correct");
            banners[index].textContent = "+1";
        } else {
            scores[index].classList.remove("correct");
            banners[index].classList.remove("correct");
            banners[index].textContent = "+0";
        }
    });
});

callbacks.set("next", ({}) => {
    animateBanners();
});

/* whole bankRow is a tagDiv
    <div class="bankRow">
        <div class="checkBox">
            <i class="fa-solid fa-circle checkMark"></i>
        </div>
        <div class="bankNum">1.</div>
        <div class="bankContent">#Linguistics
            <span class="bankCount">(10)</span>
        </div>
    </div>
*/

function buildTagDivs() {
    parentDiv = document.getElementById("tags");
    parentDiv.innerHTML = "";
    tagDivs = []; // bank rows

    tagRepo.forEach((tag, index) => {
        const tagDiv = document.createElement("div");
        tagDiv.classList.add("bankRow");

        const checkBoxDiv = document.createElement("div");
        checkBoxDiv.classList.add("checkBox");

        const checkBoxI = document.createElement("i");

        const bankNumDiv = document.createElement("div");
        bankNumDiv.classList.add("bankNum");
        bankNumDiv.textContent = `${index + 1}.`;

        const bankContentDiv = document.createElement("div");
        bankContentDiv.classList.add("bankContent");
        bankContentDiv.textContent = `#${tag.content}`;
        bankContentDiv.style.color = tag.color;

        const bankCountSpan = document.createElement("span");
        bankCountSpan.classList.add("bankCount");
        bankCountSpan.textContent = `(${tag.questionIndices.length})`;

        checkBoxDiv.appendChild(checkBoxI);
        bankContentDiv.appendChild(bankCountSpan);

        tagDiv.appendChild(checkBoxDiv);
        tagDiv.appendChild(bankNumDiv);
        tagDiv.appendChild(bankContentDiv);

        tagDivs.push(tagDiv);
        parentDiv.appendChild(tagDiv);
    });
}

/* whole bankRow is a questionDiv
    <div class="bankRow">
        <div class="checkBox">
            <i class="fa-solid fa-circle checkMark"></i>
        </div>
        <div class="bankNum">1.</div>
        <div class="bankContent">Stores that food or drinks in Singapore
            <span class="bankCount">#Singapore</span>
            <span class="bankCount">#Culinary</span>
        </div>
    </div>
*/

function buildQuestionDivs(type) {
    if (type < 0 || type > 1) {
        return;
    }

    parentDiv = document.getElementById(type == 0 ? "questions1" : "questions0");
    parentDiv.innerHTML = "";
    questionDivs[type] = []; // bank rows

    questionRepo[type].forEach((question, index) => {
        const questionDiv = document.createElement("div");
        questionDiv.classList.add("bankRow");

        const checkBoxDiv = document.createElement("div");
        checkBoxDiv.classList.add("checkBox");

        const checkBoxI = document.createElement("i");

        const bankNumDiv = document.createElement("div");
        bankNumDiv.classList.add("bankNum");
        bankNumDiv.textContent = `${index + 1}.`;

        const bankContentDiv = document.createElement("div");
        bankContentDiv.classList.add("bankContent");
        bankContentDiv.textContent = `#${question.content}`;

        question.tags.forEach(tagIndex => {
            const bankCountSpan = document.createElement("span");
            bankCountSpan.classList.add("bankCount");
            bankCountSpan.textContent = `#${tagRepo[tagIndex].content}`;
            bankCountSpan.style.color = tagRepo[tagIndex].color;
        })

        checkBoxDiv.appendChild(checkBoxI);
        bankContentDiv.appendChild(bankCountSpan);

        questionDiv.appendChild(checkBoxDiv);
        questionDiv.appendChild(bankNumDiv);
        questionDiv.appendChild(bankContentDiv);

        questionDivs[type].push(questionDiv);
        parentDiv.appendChild(questionDiv);
    });
}

/*
function buildQuestions1Map() {
    question1Map = new Map();

    questionRepo[0].forEach((question, questionIndex) => {
        question.tagIndices.forEach(tagIndex => {
            if (!question1Map.has(tagIndex)) {
                question1Map.set(tagIndex, []);
            }

            question1Map.get(tagIndex).push(questionIndex);
        });
    });
}
*/

callbacks.set("bank", ({ _tagRepo, _questionRepo, _tickedQuestions, _crossedQuestions, _tickedTags, _crossedTags }) => {
    tagRepo = _tagRepo;
    questionRepo = _questionRepo;
    tickedQuestions = _tickedQuestions;
    crossedQuestions = _crossedQuestions;
    tickedTags = _tickedTags;
    crossedTags = _crossedTags;

    buildTagDivs();
    buildQuestionDivs(0);
    buildQuestionDivs(1);
});

callbacks.set("clickTag", ({ index, option }) => {
    switch (option) {
        case CheckOption.UNCHECKED:
            tickedTags.delete(index);
            crossedTags.delete(index);
            break;

        case CheckOption.TICKED:
            tickedTags.add(index);
            crossedTags.delete(index);
            break;

        case CheckOption.CROSSED:
            crossedTags.add(index);
            tickedTags.delete(index);
            break;
    }

    if (currTab == Tab.TAGS) {
        clickTagsTab();
    } else {
        clickQuestionsTab(currTab - 1);
    }
});

callbacks.set("clickQuestion", ({ index, option, type }) => {
    if (type < 0 || type > 1) {
        return;
    }

    switch (option) {
        case CheckOption.UNCHECKED:
            tickedQuestions[type].delete(index);
            crossedQuestions[type].delete(index);
            break;

        case CheckOption.TICKED:
            tickedQuestions[type].add(index);
            crossedQuestions[type].delete(index);
            break;

        case CheckOption.CROSSED:
            crossedQuestions[type].add(index);
            tickedQuestions[type].delete(index);
            break;
    }

    if (currTab == Tab.TAGS) {
        clickTagsTab();
    } else {
        clickQuestionsTab(currTab - 1);
    }
});

//todo ------------ bank ------------ //

// logic
let tagRepo = []; // array of { content (string), color (string), questionIndices (array of numbers) }
let questionRepo = [[], []]; // array of { content (string) : tagIndices (set of numbers) } for both types
let question1Pool = new Set(); // set of questionIndex (number) for type 1 only, not inclusive of ticked/crossedQuestions

// logic
let tickedQuestions = [new Set(), new Set()]; // set of questionIndex (number) for both types
let crossedQuestions = [new Set(), new Set()]; // set of questionIndex (number) for both types
let tickedTags = new Set(); // set of tagIndex (number)
let crossedTags = new Set(); // set of tagIndex (number)

// ui
const CheckOption = Object.freeze({ UNCHECKED: 0, TICKED: 1, CROSSED: 2 }); // "Option" was taken already :(
const Tab = Object.freeze({ TAGS: 0, QUESTIONS1: 1, QUESTIONS2: 2, NONE: 3 }); // none means not in bank
const optionIcons = ["fa-solid fa-circle checkMark", "fas fa-check checkMark", "fa-solid fa-xmark"];

// ui
let tagDivs = []; // array of tags (element)
let questionDivs = [[], []]; // array of questions (element) for both types
let currTab = Tab.TAGS; 

// tab switching animation
const tabs = document.querySelectorAll(".tab");
tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        tabs.forEach(innerTab => {
            innerTab.classList.remove("selected");
        });
        tab.classList.add("selected");
    });
});

function clickTag(index) {
    sendMessage("clickTag", { index });
}

function clickQuestion(index, type) {
    if (type < 0 || type > 1) {
        return;
    }

    sendMessage("clickQuestion", { index, type });
}

function setTagIcon(index, option) {
    if (index < 0 || index >= tagDivs.length) {
        return;
    }

    const bankRow = tagDivs[index];
    const checkBoxI = bankRow.querySelector(".i");
    const bankNumDiv = bankRow.querySelector(".bankNum");
    const bankContentDiv = bankRow.querySelector(".bankContent");
    
    // set icon for check box
    checkBoxI.className = optionIcons[option];

    switch (option) {
        case CheckOption.TICKED:
            bankNumDiv.classList.remove("unused");
            bankContentDiv.classList.remove("unused");
            break;
            
        case CheckOption.UNCHECKED:
        case CheckOption.CROSSED:
            bankNumDiv.classList.add("unused");
            bankContentDiv.classList.add("unused");
            break;
    }
}

// type == 0 for type 1, type == 1 for type 2
function setQuestionIcon(index, option, type) {
    if (type < 0 || type > 1 || index < 0 || index >= questionDivs[type].length) {
        return;
    }

    const bankRow = questionDivs[type][index];
    const checkBoxI = bankRow.querySelector(".i");
    const bankNumDiv = bankRow.querySelector(".bankNum");
    const bankContentDiv = bankRow.querySelector(".bankContent");
    
    // set icon for check box
    checkBoxI.className = optionIcons[option]

    // type 1 needs to check for extra stuff before setting unused class
    if (type == 0) {
        switch (option) {

            // default to tag's value if type 1 (type 2 does not have this option)
            case CheckOption.UNCHECKED:
                if (question1Pool.has(index)) {
                    bankNumDiv.classList.remove("unused");
                    bankContentDiv.classList.remove("unused");

                } else {
                    bankNumDiv.classList.add("unused");
                    bankContentDiv.classList.add("unused");
                }
                break;

            case CheckOption.TICKED:
                bankNumDiv.classList.remove("unused");
                bankContentDiv.classList.remove("unused");
                break;

            case CheckOption.CROSSED:
                bankNumDiv.classList.add("unused");
                bankContentDiv.classList.add("unused");
                break;
        }

    } else {
        if (option == CheckOption.TICKED) {
            bankNumDiv.classList.remove("unused");
            bankContentDiv.classList.remove("unused");

        } else {
            bankNumDiv.classList.add("unused");
            bankContentDiv.classList.add("unused");
        }
    }
}

// only for type 1 (type 2 no tags)
function buildPoolFromTags() {

    // set union
    tickedTags.forEach(tagIndex => {
        question1Pool = question1Pool.union(tagRepo[tagIndex].questionIndices);
    });

    // set difference (after union because exclusion has higher priority)
    crossedTags.forEach(tagIndex => {
        question1Pool = question1Pool.difference(tagRepo[tagIndex].questionIndices);
    });
}

function clickTagsTab() {
    currTab = tabs.TAGS;

    document.getElementById("tags").style.display = "block";
    document.getElementById("questions1").style.display = "none";
    document.getElementById("questions2").style.display = "none";

    // redraw all tags check boxes and opacity correctly (the div should already exist)
    tagRepo.forEach((tag, index) => {
        setTagIcon(index, CheckOption.UNCHECKED);
    });
    tickedTags.forEach(tagIndex => { 
        setTagIcon(tagIndex, CheckOption.TICKED);
    });
    crossedTags.forEach(tagIndex => {
        setTagIcon(tagIndex, CheckOption.CROSSED);
    });
}

function clickQuestionsTab(type) {
    if (type < 0 || type > 1) {
        return;
    }

    currTab = type + 1;

    // set all unchecked (which will also check for pool) for type 1 and all ticked for type 2
    for (let i = 0; i < questionDivs[type].length; ++i) {
        setQuestionIcon(i, type == 0 ? CheckOption.UNCHECKED : CheckOption.TICKED, type);
    }

    if (type == 0) {
        document.getElementById("tags").style.display = "none";
        document.getElementById("questions1").style.display = "block";
        document.getElementById("questions2").style.display = "none";

        // set ticks if type 1
        tickedQuestions[0].forEach(questionIndex => {
            setQuestionIcon(questionIndex, CheckOption.TICKED, 0);
        });
    
    } else {
        document.getElementById("tags").style.display = "none";
        document.getElementById("questions1").style.display = "none";
        document.getElementById("questions2").style.display = "block";
    }

    // set crosses (type 2 ignores ticked questions)
    crossedQuestions[type].forEach(questionIndex => {
        setQuestionIcon(questionIndex, CheckOption.CROSSED, type);
    });
}

function goBack() {
    currTab = Tab.NONE;

    document.getElementById("bank").style.display = "none";
    document.getElementById("home").style.display = "block";
}

function pullBank() {
}