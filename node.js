

let themeToggle = document.querySelector(".theme-toggle");

function append(value) {
  if (display.innerText === "0") {
    display.innerText = value;
  } else {
    display.innerText += value;
  }
}

function clearDisplay() {
  display.innerText = "0";
}

function deleteLast() {
  if (display.innerText.length > 1) {
    display.innerText = display.innerText.slice(0, -1);
  } else {
    display.innerText = "0";
  }
}

function calculate() {
  try {
    display.innerText = eval(display.innerText.replace("÷", "/").replace("×", "*"));
  } catch {
    display.innerText = "Error";
  }
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  document.body.classList.toggle("light");

  // Toggle icon
  if (document.body.classList.contains("light")) {
    themeToggle.innerText = "☀️";
  } else {
    themeToggle.innerText = "🌙";
  }
}




let display = document.getElementById("display");

    function append(value) {
      if (display.innerText === "0") {
        display.innerText = value;
      } else {
        display.innerText += value;
      }
    }

    function clearDisplay() {
      display.innerText = "0";
    }

    function deleteLast() {
      if (display.innerText.length > 1) {
        display.innerText = display.innerText.slice(0, -1);
      } else {
        display.innerText = "0";
      }
    }

    function calculate() {
      try {
        display.innerText = eval(display.innerText.replace("÷", "/").replace("×", "*"));
      } catch {
        display.innerText = "Error";
      }
    }




    
/* ✅ Keyboard Support */
document.addEventListener("keydown", function(event) {
  const key = event.key;

  if (!isNaN(key) || ["+", "-", "*", "/", "%", "."].includes(key)) {
    append(key);
  } else if (key === "Enter" || key === "=") {
    calculate();
  } else if (key === "Backspace") {
    deleteLast();
  } else if (key === "Escape") {
    clearDisplay();
  }
});



function startVoice() {

    // 🎵 Play beep sound when mic starts
document.getElementById("beepSound").play();


  // SpeechRecognition API setup
  let recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = "en-IN"; // Indian English

  recognition.start();

  recognition.onresult = function(event) {
    // Convert speech to text
    let speech = event.results[0][0].transcript.toLowerCase();

    // Replace words with math symbols
    speech = speech.replace(/plus/gi, "+")
                   .replace(/minus/gi, "-")
                   .replace(/multiply|into|times/gi, "*")
                   .replace(/divide|by/gi, "/");

    // Show recognized text
    document.getElementById("voiceText").innerText = "You said: " + speech;

    // Calculate and show result (if valid)
    try {
      let result = eval(speech);
      if (!isNaN(result)) {
        document.getElementById("voiceText").innerText += " = " + result;
      }
    } catch {
      document.getElementById("voiceText").innerText += " (Invalid expression)";
    }
  };
}





// Function to play beep sound
function playSound() {
  let sound = document.getElementById("btnSound");
  sound.currentTime = 0; // reset so it can replay on fast clicks
  sound.play();
}


function playEqualSound() {
  let sound = document.getElementById("equalSound");
  sound.currentTime = 0; // reset for quick clicks
  sound.play();
}


function appendPercent() {
  let display = document.getElementById("display");
  display.innerText = parseFloat(display.innerText) / 100;
}

function calculatePercentageOf() {
  let display = document.getElementById("display").innerText;
  // Split expression like "1500*2%"
  if (display.includes("%")) {
    let parts = display.split("*");
    if (parts.length === 2) {
      let base = parseFloat(parts[0]);
      let percent = parseFloat(parts[1]);
      let result = (base * percent) / 100;
      document.getElementById("display").innerText = result;
    }
  }
}
