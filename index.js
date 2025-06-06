//todo ------------ actual todos ------------ //

/*
    hard mode where you can only use each word once
    enter to go to next wrong/empty input
*/

//todo ------------ global ------------ //

let gameType = 2;
let letterType = 2; // 1 => start with, 2 => contain but not start with
let chosenLetter = "a";

//todo ------------ answering ------------ //

const inputs = document.querySelectorAll(".qInput");
// wtf .fill() fills them up with references, i swear why the fuck can't languages be explicit as to whether something is a reference like goated cpp
const answers = Array.from({ length: inputs.length }, () => ({
    input: "",
    answer: "",
    identicalIndices: new Set()
})); // answer only used for type 2 for bracket and similarity check (if type 1, input == answer)
const questions = document.querySelectorAll(".qContent");

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

function checkValidity(element, index) {
    // remove leading and trailing whitespaces
    let input = element.textContent;
    input = input.trim();
    element.textContent = input;
    let isValid = true;
    input = input.toLowerCase(); // but don't override player's answer with lowercase chars

    // skip checking empty word
    if (input.length == 0) {
        
        // set other red answers possibly back to green
        answers[index].identicalIndices.forEach(value => {
            answers[value].identicalIndices.delete(index);
            if (answers[value].identicalIndices.size == 0) {
                setValidity(true, inputs[value]);
            }
        });
        
        setUnanswered(element);
        answers[index] = { input: "", answer: "", identicalIndices: new Set() };
        return;
    }

    // error checking
    let answer = input; // don't need new String(input) because...strings are primitives?? wtf?
    if (gameType == 1) {
        if ((letterType == 1 && input[0] != chosenLetter) || 
        (letterType == 2 && (input[0] == chosenLetter || !input.includes(chosenLetter)))) {
            isValid = false;
        }

    } else {
        // word must appear at the front or back of the input
        const word = questions[index].textContent;
        const indexOfWord = input.indexOf(word);
        if (indexOfWord == -1 || input.length == word.length || // word or non-word input doesn't exist
            (indexOfWord != 0 && indexOfWord != input.length - word.length)) { // word not at front and back of input
            isValid = false;
        }

        // input without word must not have spaces and must include the letter
        if (isValid) {
            answer = indexOfWord == 0 ? input.substring(word.length) : input.substring(0, input.length - word.length);
            answer = answer.trim();
            if (!answer.includes(chosenLetter) || answer.includes(" ")) {
                isValid = false;
            }
        }
    }

    const identicalIndices = answers[index].identicalIndices;
    answers.forEach((otherAnswer, otherIndex) => {
        if (otherAnswer.answer.length == 0 || index == otherIndex) {
            return;
        }

        // not self and same answer
        if (answer == otherAnswer.answer) {
            setValidity(false, inputs[otherIndex]);
            console.log(answers[0].identicalIndices === answers[1].identicalIndices);
            identicalIndices.add(otherIndex);
            answers[otherIndex].identicalIndices.add(index);

        // different answer and used to be same
        } else if (answer != otherAnswer.answer && identicalIndices.has(otherIndex)) {
            identicalIndices.delete(otherIndex);
            answers[otherIndex].identicalIndices.delete(index);
            
            if (answers[otherIndex].identicalIndices.size == 0) {
                setValidity(true, inputs[otherIndex]);
            }
        }
    });

    answers.forEach((a, i) => {
        console.log(`${i}: ${a.identicalIndices.size}`);
        a.identicalIndices.forEach(elem => {
            console.log(elem);
        });
    });

    if (identicalIndices.size != 0) {
        isValid = false;
    }

    setValidity(isValid, element);
    answers[index] = { input, answer, identicalIndices };
}

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

// input override for enter, tab, up arrow, down arrow
inputs.forEach((element, index) => {
    element.addEventListener("keydown", event => {
        if (event.key == "Enter" || event.key == "Tab") {
            event.preventDefault();
            focusAtEnd(inputs[findNextIndex(index)]);
            checkValidity(element, index);

        } else if (event.key == "ArrowDown") {
            event.preventDefault();
            focusAtEnd(inputs[index == inputs.length - 1 ? 0 : index + 1]);
            checkValidity(element, index);

        } else if (event.key == "ArrowUp") {
            event.preventDefault();
            focusAtEnd(inputs[index == 0 ? inputs.length - 1 : index - 1]);
            checkValidity(element, index);
        }
    });
});

//todo ------------ voting ------------ //

const isPhone = window.matchMedia("only screen and (max-width: 600px)").matches;

const circles = document.querySelectorAll(".circle");
const selection = [];
circles.forEach(_ => {
    selection.push(-1);
})

const banners = document.querySelectorAll(".banner");

function moveCircleTo(row, col) {
    
    // appear
    if (selection[row] == -1) {
        circles[row].style.width = "6vh";
        circles[row].style.height = "6vh";
        // circles[row].style.border = "0.1vh solid var(--grey)";
        circles[row].style.transition = "box-shadow 0.5s ease, width 0.35s ease-in, height 0.35s ease-in, border-width 0.5s linear";

    // disappear
    } else if (col == selection[row]) {
        selection[row] = -1;
        circles[row].style.width = "0vh";
        circles[row].style.height = "0vh";
        // circles[row].style.border = "0vh solid var(--grey)";
        return;

    // move
    } else {

        // set colour depending on value picked
        if (col < 3) {
            circles[row].classList.remove("correct");
        } else {
            circles[row].classList.add("correct");
        }
        
        circles[row].style.transition = "box-shadow 0.5s ease, width 0.35s ease-in, height 0.35s ease-in, border-width 0.5s linear, left 0.5s cubic-bezier(0.8, 0, 0.2, 1)";
    }

    if (isPhone) {
        circles[row].style.left = (14 + 12.1 * col) + "%";
    } else {
        circles[row].style.left = (2.6 + 14.5 * col) + "%";
    }
    selection[row] = col;
}

// click next button to show coloured banners 
document.getElementById("next").addEventListener("click", function () { // can't use this in lambda function
    banners.forEach(banner => {
        banner.style.animation = "none";
        banner.offsetHeight;
        banner.style.animation = "bannerPop 1.5s ease-out forwards";
    });

    this.style.animation = "none";
    this.offsetHeight;
    this.style.animation = "pulse 0.5s ease-out";
});

//todo ------------ home ------------ //

// fixed number of elements
const configArrows = document.querySelectorAll(".sValue");
const configMenus = document.querySelectorAll(".menu");
const configValues = Array(5).fill(0);
const menuIsClicked = Array(5).fill(false);
const configOptions = []; // list of lists of dom elements

function closeMenu(index) {
    configMenus[index].style.height = "0vh";
    configMenus[index].style.maxHeight = "0vh";
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
    const rgb = hexToRgb(event.target.value);
    console.log({ rgb });
    document.documentElement.style.setProperty("--theme", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
});

// rename
document.getElementById("rename").addEventListener("click", _ => {
    const username = prompt("Enter your username: ");
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
configOptions.forEach((config, index) => {
    config.forEach(element => {
        element.addEventListener("click", () => {
            configArrows[index].childNodes[0].textContent = element.textContent + " ";
            closeMenu(index);
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
            // configMenus[index].style.paddingBottom = "0vh";

            const fullHeight = configMenus[index].scrollHeight + "px";

            // Set back to 0, then animate to fullHeight
            configMenus[index].style.height = "0px";
            configMenus[index].offsetHeight; // force reflow

            configMenus[index].style.height = fullHeight;
            configMenus[index].style.maxHeight = "30vh";

            setTimeout(() => {
                configMenus[index].style.overflow = "auto";
            }, 500);

            element.classList.add("open");
        }

        menuIsClicked[index] = !menuIsClicked[index];
    });
});