const SEGMENTS = {
    a: '10,4 50,4 45,12 15,12',
    b: '53,8 53,51 45,47 45,14',
    c: '53,59 53,102 45,96 45,63',
    d: '10,106 50,106 45,98 15,98',
    e: '7,59 7,102 15,96 15,63',
    f: '7,8 7,51 15,47 15,14',
    g: '12,51 48,51 51,55 48,59 12,59 9,55'
};

const DIGIT_MAP = {
    '0': ['a', 'b', 'c', 'd', 'e', 'f'],
    '1': ['b', 'c'],
    '2': ['a', 'b', 'g', 'e', 'd'],
    '3': ['a', 'b', 'g', 'c', 'd'],
    '4': ['f', 'g', 'b', 'c'],
    '5': ['a', 'f', 'g', 'c', 'd'],
    '6': ['a', 'f', 'e', 'd', 'c', 'g'],
    '7': ['a', 'b', 'c'],
    '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    '9': ['a', 'b', 'c', 'd', 'f', 'g']
};

const digitIds = ['digitH1', 'digitH2', 'digitM1', 'digitM2', 'digitS1', 'digitS2'];
digitIds.forEach(function (id) {
    const svg = document.getElementById(id);
    Object.keys(SEGMENTS).forEach(function (segKey) {
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', SEGMENTS[segKey]);
        poly.setAttribute('data-seg', segKey);
        svg.appendChild(poly);
    });
});

function drawDigit(svgId, char, isPowerOff) {
    const svg = document.getElementById(svgId);
    const activeList = isPowerOff ? [] : (DIGIT_MAP[char] || []);
    svg.querySelectorAll('polygon').forEach(function (poly) {
        const seg = poly.getAttribute('data-seg');
        if (isPowerOff) {
            poly.setAttribute('fill', '#1c1d1e');
        } else if (activeList.indexOf(seg) !== -1) {
            poly.setAttribute('fill', '#232425');
        } else {
            poly.setAttribute('fill', '#6f7274');
        }
    });
}

// Web Audio API로 "삐-빅!" 전자시계 소리 내기
let audioCtx = null;

function unlockAudio() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playDoubleBeep() {
    unlockAudio();
    if (!audioCtx) return;

    const nowTime = audioCtx.currentTime;
    [0, 0.14].forEach(function (offset, idx) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = idx === 0 ? 1100 : 1480;
        gain.gain.setValueAtTime(0.08, nowTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, nowTime + offset + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(nowTime + offset);
        osc.stop(nowTime + offset + 0.1);
    });
}

// 시계 상태 변수 (기본 시각 00:00:00)
let curH = 0;
let curM = 0;
let curS = 0;
let battery = 100;

// setCount: 0(일반), 1(현재시간 설정), 2(알람 설정), 3(설정된 알람 확인)
let setCount = 0;
let timeUnitStep = 0;
let alarmStep = 'slot';
let selectedAlarmIdx = 0;
let isRinging = false;
let ringTimer = null;
let beepInterval = null;

const alarms = [
    { h: 0, m: 0, s: 0, isSet: false },
    { h: 0, m: 0, s: 0, isSet: false },
    { h: 0, m: 0, s: 0, isSet: false }
];

let editAlarmH = 0;
let editAlarmM = 0;
let editAlarmS = 0;

function padTwo(n) {
    return String(n).padStart(2, '0');
}

function showWarn(msg) {
    const badge = document.getElementById('warnBadge');
    badge.textContent = msg;
    badge.classList.add('is-visible');
    setTimeout(function () {
        badge.classList.remove('is-visible');
    }, 2500);
}

function resetAllOnDischarge() {
    curH = 0;
    curM = 0;
    curS = 0;
    setCount = 0;
    timeUnitStep = 0;
    alarmStep = 'slot';
    selectedAlarmIdx = 0;
    editAlarmH = 0;
    editAlarmM = 0;
    editAlarmS = 0;
    stopRinging();

    for (let i = 0; i < alarms.length; i++) {
        alarms[i] = { h: 0, m: 0, s: 0, isSet: false };
    }
}

// 알람 울림: 5초 동안 큰 화면 깜빡임 + 시계 진동 + 0.65초마다 삐빅! 반복
function startRinging() {
    stopRinging();
    isRinging = true;
    playDoubleBeep();
    beepInterval = setInterval(playDoubleBeep, 650);
    render();

    ringTimer = setTimeout(function () {
        stopRinging();
        render();
    }, 5000);
}

function stopRinging() {
    isRinging = false;
    if (ringTimer) {
        clearTimeout(ringTimer);
        ringTimer = null;
    }
    if (beepInterval) {
        clearInterval(beepInterval);
        beepInterval = null;
    }
}

function render() {
    const isOff = battery === 0;
    const clockRoot = document.getElementById('alarmClockRoot');
    const lcdScreen = document.getElementById('lcdScreen');
    const statusBox = document.getElementById('statusBox');
    const closedDoor = document.getElementById('closedDoorGroup');
    const openDoor = document.getElementById('openDoorGroup');
    const batteryOutline = document.getElementById('batteryOutline');
    const batteryTip = document.getElementById('batteryTip');
    const batteryFillRect = document.getElementById('batteryFillRect');
    const batteryBolt = document.getElementById('batteryBolt');

    document.getElementById('batteryNum').textContent = battery;
    batteryFillRect.setAttribute('width', Math.round((battery / 100) * 34));

    clockRoot.classList.toggle('is-ringing', !isOff && isRinging);
    lcdScreen.classList.toggle('is-power-off', isOff);
    lcdScreen.classList.toggle('is-ringing', !isOff && isRinging);
    statusBox.classList.toggle('is-power-off', isOff);

    if (isOff) {
        closedDoor.style.display = 'none';
        openDoor.style.display = 'block';
        batteryOutline.setAttribute('stroke', '#1c1d1e');
        batteryTip.setAttribute('fill', '#1c1d1e');
        batteryBolt.style.display = 'block';
    } else {
        closedDoor.style.display = 'block';
        openDoor.style.display = 'none';
        batteryOutline.setAttribute('stroke', '#ffffff');
        batteryTip.setAttribute('fill', '#ffffff');
        batteryBolt.style.display = 'none';
    }

    document.querySelectorAll('.alarm-clock__alarm-icon').forEach(function (icon, idx) {
        icon.classList.toggle('is-set', alarms[idx].isSet);
        icon.classList.toggle('is-selecting', !isOff && ((setCount === 2 && alarmStep === 'slot') || setCount === 3) && selectedAlarmIdx === idx);
    });

    let showH = curH;
    let showM = curM;
    let showS = curS;

    if (setCount === 2) {
        if (alarmStep === 'slot') {
            showH = alarms[selectedAlarmIdx].h;
            showM = alarms[selectedAlarmIdx].m;
            showS = alarms[selectedAlarmIdx].s;
        } else {
            showH = editAlarmH;
            showM = editAlarmM;
            showS = editAlarmS;
        }
    } else if (setCount === 3) {
        showH = alarms[selectedAlarmIdx].h;
        showM = alarms[selectedAlarmIdx].m;
        showS = alarms[selectedAlarmIdx].s;
    }

    const hStr = padTwo(showH);
    const mStr = padTwo(showM);
    const sStr = padTwo(showS);

    drawDigit('digitH1', hStr[0], isOff);
    drawDigit('digitH2', hStr[1], isOff);
    drawDigit('digitM1', mStr[0], isOff);
    drawDigit('digitM2', mStr[1], isOff);
    drawDigit('digitS1', sStr[0], isOff);
    drawDigit('digitS2', sStr[1], isOff);

    const blinkHour = !isOff && ((setCount === 1 && timeUnitStep === 0) || (setCount === 2 && alarmStep === 'hour'));
    const blinkMin = !isOff && ((setCount === 1 && timeUnitStep === 1) || (setCount === 2 && alarmStep === 'min'));
    const blinkSec = !isOff && ((setCount === 1 && timeUnitStep === 2) || (setCount === 2 && alarmStep === 'sec'));

    document.getElementById('pairHour').classList.toggle('is-blinking', blinkHour);
    document.getElementById('pairMin').classList.toggle('is-blinking', blinkMin);
    document.getElementById('pairSec').classList.toggle('is-blinking', blinkSec);
}

// 1초마다 배터리 1% 감소 및 시계 초 증가
setInterval(function () {
    if (battery > 0) {
        battery = battery - 1;
        if (battery === 0) {
            resetAllOnDischarge();
        }
    }

    if (setCount !== 1 && battery > 0) {
        curS = curS + 1;
        if (curS >= 60) {
            curS = 0;
            curM = curM + 1;
        }
        if (curM >= 60) {
            curM = 0;
            curH = (curH + 1) % 24;
        }
    }

    if (battery > 0) {
        const matched = alarms.some(function (al) {
            return al.isSet && al.h === curH && al.m === curM && al.s === curS;
        });
        if (matched) {
            startRinging();
        }
    }

    render();
}, 1000);

document.getElementById('btnSet').addEventListener('click', function () {
    unlockAudio();
    if (battery === 0) return;
    if (isRinging) {
        stopRinging();
        render();
        return;
    }
    setCount = (setCount + 1) % 4;
    timeUnitStep = 0;
    alarmStep = 'slot';
    render();
});

document.getElementById('btnUp').addEventListener('click', function () {
    unlockAudio();
    if (battery === 0) return;
    if (isRinging) {
        stopRinging();
        render();
        return;
    }

    if (setCount === 1) {
        if (timeUnitStep === 0) curH = (curH + 1) % 24;
        else if (timeUnitStep === 1) curM = (curM + 1) % 60;
        else if (timeUnitStep === 2) curS = (curS + 1) % 60;
    } else if (setCount === 2) {
        if (alarmStep === 'slot') {
            selectedAlarmIdx = (selectedAlarmIdx + 1) % 3;
        } else if (alarmStep === 'hour') {
            editAlarmH = (editAlarmH + 1) % 24;
        } else if (alarmStep === 'min') {
            editAlarmM = (editAlarmM + 1) % 60;
        } else if (alarmStep === 'sec') {
            editAlarmS = (editAlarmS + 1) % 60;
        }
    } else if (setCount === 3) {
        selectedAlarmIdx = (selectedAlarmIdx + 1) % 3;
    }
    render();
});

document.getElementById('btnDown').addEventListener('click', function () {
    unlockAudio();
    if (battery === 0) return;
    if (isRinging) {
        stopRinging();
        render();
        return;
    }

    if (setCount === 1) {
        if (timeUnitStep === 0) curH = (curH + 23) % 24;
        else if (timeUnitStep === 1) curM = (curM + 59) % 60;
        else if (timeUnitStep === 2) curS = (curS + 59) % 60;
    } else if (setCount === 2) {
        if (alarmStep === 'slot') {
            selectedAlarmIdx = (selectedAlarmIdx + 2) % 3;
        } else if (alarmStep === 'hour') {
            editAlarmH = (editAlarmH + 23) % 24;
        } else if (alarmStep === 'min') {
            editAlarmM = (editAlarmM + 59) % 60;
        } else if (alarmStep === 'sec') {
            editAlarmS = (editAlarmS + 59) % 60;
        }
    } else if (setCount === 3) {
        selectedAlarmIdx = (selectedAlarmIdx + 2) % 3;
    }
    render();
});

document.getElementById('btnConfirm').addEventListener('click', function () {
    unlockAudio();
    if (battery === 0) return;
    if (isRinging) {
        stopRinging();
        render();
        return;
    }

    if (setCount === 1) {
        if (timeUnitStep < 2) {
            timeUnitStep = timeUnitStep + 1;
        } else {
            setCount = 0;
            timeUnitStep = 0;
        }
    } else if (setCount === 2) {
        if (alarmStep === 'slot') {
            editAlarmH = alarms[selectedAlarmIdx].h;
            editAlarmM = alarms[selectedAlarmIdx].m;
            editAlarmS = alarms[selectedAlarmIdx].s;
            alarmStep = 'hour';
        } else if (alarmStep === 'hour') {
            alarmStep = 'min';
        } else if (alarmStep === 'min') {
            alarmStep = 'sec';
        } else if (alarmStep === 'sec') {
            if (editAlarmH === 0 && editAlarmM === 0 && editAlarmS === 0) {
                alarms[selectedAlarmIdx] = { h: 0, m: 0, s: 0, isSet: false };
                showWarn('00:00:00은 설정 불가 (23:59:59로 설정)');
            } else {
                alarms[selectedAlarmIdx] = { h: editAlarmH, m: editAlarmM, s: editAlarmS, isSet: true };
            }
            setCount = 0;
            alarmStep = 'slot';
        }
    } else if (setCount === 3) {
        setCount = 0;
    }
    render();
});

document.getElementById('batteryDoorWide').addEventListener('click', function () {
    unlockAudio();
    battery = 100;
    render();
});

document.getElementById('batteryDoorLatch').addEventListener('click', function (e) {
    e.stopPropagation();
    unlockAudio();
    battery = 0;
    resetAllOnDischarge();
    render();
});

document.getElementById('openDoorGroup').addEventListener('click', function () {
    unlockAudio();
    battery = 100;
    render();
});

render();