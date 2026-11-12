const DB_KEY = 'mediqueue_gm_bookings_v1';
const MY_TICKET_KEY = 'mediqueue_gm_my_ticket';
const MAX_PER_SLOT = 4;

const TIME_SLOTS = [
    '08:30 - 09:00',
    '09:00 - 09:30',
    '09:30 - 10:00',
    '10:00 - 10:30',
    '10:30 - 11:00',
    '11:00 - 11:30'
];

const HOSPITAL_NAMES = {
    EFSTH: 'EFSTH (Banjul)',
    KGH: 'Kanifing General',
    SGH: 'Serekunda General',
    BDH: 'Brikama District'
};

const DEPT_NAMES = {
    OPD: 'General OPD',
    MAT: 'Maternity',
    PED: 'Pediatrics',
    DEN: 'Dental Clinic'
};

const todayStr = new Date().toISOString().split('T')[0];
const visitDateInput = document.getElementById('visit-date');
visitDateInput.value = todayStr;
visitDateInput.min = todayStr;

let selectedSlot = '';

// Pre-load realistic Gambian bookings so demo looks alive right away
function getBookings() {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);

    const seed = [
        { id: 'KGH-OPD-101', hospital: 'KGH', dept: 'OPD', date: todayStr, slot: '08:30 - 09:00', name: 'Lamin Touray', phone: '7712345', status: 'Checked In' },
        { id: 'KGH-OPD-102', hospital: 'KGH', dept: 'OPD', date: todayStr, slot: '08:30 - 09:00', name: 'Awa Ceesay', phone: '3456789', status: 'Confirmed' },
        { id: 'KGH-OPD-103', hospital: 'KGH', dept: 'OPD', date: todayStr, slot: '08:30 - 09:00', name: 'Modou Njie', phone: '9911223', status: 'Confirmed' },
        { id: 'KGH-OPD-104', hospital: 'KGH', dept: 'OPD', date: todayStr, slot: '08:30 - 09:00', name: 'Mariama Bah', phone: '2233445', status: 'Confirmed' },
        { id: 'KGH-OPD-105', hospital: 'KGH', dept: 'OPD', date: todayStr, slot: '09:00 - 09:30', name: 'Ousman Camara', phone: '6677889', status: 'Confirmed' }
    ];
    localStorage.setItem(DB_KEY, JSON.stringify(seed));
    return seed;
}

function saveBookings(list) {
    localStorage.setItem(DB_KEY, JSON.stringify(list));
}

// Render available 30-min slots & live crowd indicator
function renderSlotsAndCrowd() {
    const hosp = document.getElementById('hospital-select').value;
    const dept = document.getElementById('dept-select').value;
    const date = visitDateInput.value;
    const bookings = getBookings().filter(b => b.hospital === hosp && b.dept === dept && b.date === date);

    // Update Crowd Meter
    const totalCapacity = TIME_SLOTS.length * MAX_PER_SLOT;
    const pct = Math.min(100, Math.round((bookings.length / totalCapacity) * 100));
    const pill = document.getElementById('crowd-pill');
    const fill = document.getElementById('crowd-bar-fill');

    fill.style.width = `${Math.max(12, pct)}%`;
    if (pct >= 75) {
        pill.className = 'crowd-pill high';
        pill.innerText = `High Load (${pct}%)`;
        fill.style.background = '#dc2626';
    } else if (pct >= 40) {
        pill.className = 'crowd-pill med';
        pill.innerText = `Moderate (${pct}%)`;
        fill.style.background = '#d97706';
    } else {
        pill.className = 'crowd-pill low';
        pill.innerText = `Low Crowd (${pct}%)`;
        fill.style.background = '#16a34a';
    }

    // Render Time Slot Buttons
    const grid = document.getElementById('slots-grid');
    grid.innerHTML = '';
    selectedSlot = '';

    TIME_SLOTS.forEach(slot => {
        const count = bookings.filter(b => b.slot === slot).length;
        const left = MAX_PER_SLOT - count;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = left <= 0 ? 'slot-btn full' : 'slot-btn';
        btn.disabled = left <= 0;
        btn.innerHTML = `<strong>${slot}</strong><span>${left <= 0 ? 'FULL (Locked)' : `${left} of ${MAX_PER_SLOT} spots left`}</span>`;

        if (left > 0) {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedSlot = slot;
            });
        }
        grid.appendChild(btn);
    });
}

['hospital-select', 'dept-select', 'visit-date'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
        renderSlotsAndCrowd();
        renderStaffQueue();
    });
});

// Book Appointment
document.getElementById('book-btn').addEventListener('click', () => {
    const name = document.getElementById('patient-name').value.trim();
    const phone = document.getElementById('patient-phone').value.trim();
    const hosp = document.getElementById('hospital-select').value;
    const dept = document.getElementById('dept-select').value;
    const date = visitDateInput.value;

    if (!name || !phone) {
        alert('Please enter the patient name and WhatsApp phone number.');
        return;
    }
    if (!selectedSlot) {
        alert('Please select an open 30-minute arrival window.');
        return;
    }

    const bookings = getBookings();
    const ticketId = `${hosp}-${dept}-${100 + bookings.length + 1}`;
    const newTicket = { id: ticketId, hospital: hosp, dept, date, slot: selectedSlot, name, phone, status: 'Confirmed' };

    bookings.push(newTicket);
    saveBookings(bookings);
    localStorage.setItem(MY_TICKET_KEY, JSON.stringify(newTicket));

    document.getElementById('patient-name').value = '';
    renderSlotsAndCrowd();
    renderMyTicket();
    switchTab('ticket');
});

// Render My Digital Queue Pass
function renderMyTicket() {
    const raw = localStorage.getItem(MY_TICKET_KEY);
    const badge = document.getElementById('ticket-badge');
    const emptyMsg = document.getElementById('no-ticket-msg');
    const card = document.getElementById('active-ticket-card');

    if (!raw) {
        badge.classList.add('hidden');
        emptyMsg.classList.remove('hidden');
        card.classList.add('hidden');
        return;
    }

    const t = JSON.parse(raw);
    const liveRecord = getBookings().find(b => b.id === t.id) || t;

    badge.classList.remove('hidden');
    emptyMsg.classList.add('hidden');
    card.classList.remove('hidden');

    document.getElementById('t-code').innerText = liveRecord.id;
    document.getElementById('t-name').innerText = liveRecord.name;
    document.getElementById('t-hospital').innerText = HOSPITAL_NAMES[liveRecord.hospital];
    document.getElementById('t-dept').innerText = DEPT_NAMES[liveRecord.dept];
    document.getElementById('t-date').innerText = liveRecord.date;
    document.getElementById('t-slot').innerText = liveRecord.slot;
    document.getElementById('t-status').innerText = liveRecord.status;
}

document.getElementById('copy-whatsapp-btn').addEventListener('click', () => {
    const t = JSON.parse(localStorage.getItem(MY_TICKET_KEY));
    if (!t) return;
    const msg = `🏥 MediQueue GM Pass\nTicket: ${t.id}\nPatient: ${t.name}\nHospital: ${HOSPITAL_NAMES[t.hospital]} (${DEPT_NAMES[t.dept]})\nDate: ${t.date}\nArrival Window: ${t.slot}`;
    navigator.clipboard.writeText(msg);
    alert('✅ Queue Pass copied! You can paste it into WhatsApp.');
});

document.getElementById('cancel-booking-btn').addEventListener('click', () => {
    const t = JSON.parse(localStorage.getItem(MY_TICKET_KEY));
    if (!t || !confirm('Cancel your appointment and release this slot?')) return;
    const updated = getBookings().filter(b => b.id !== t.id);
    saveBookings(updated);
    localStorage.removeItem(MY_TICKET_KEY);
    renderSlotsAndCrowd();
    renderMyTicket();
});

// Staff / Nurse Triage Dashboard
document.getElementById('unlock-staff-btn').addEventListener('click', () => {
    const pin = document.getElementById('staff-pin-input').value;
    if (pin === '1234') {
        document.getElementById('staff-lock-box').classList.add('hidden');
        document.getElementById('staff-dashboard').classList.remove('hidden');
        renderStaffQueue();
    } else {
        alert('Invalid PIN. Use 1234 for demo.');
    }
});

function renderStaffQueue() {
    const hosp = document.getElementById('hospital-select').value;
    const date = visitDateInput.value;
    document.getElementById('staff-hospital-title').innerText = `${HOSPITAL_NAMES[hosp]} (${date})`;

    const list = document.getElementById('staff-queue-list');
    const items = getBookings().filter(b => b.hospital === hosp && b.date === date);
    list.innerHTML = items.length ? '' : '<p class="empty-state">No bookings for this date.</p>';

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'q-item';
        const nextStatus = item.status === 'Confirmed' ? 'Checked In' : 'Seen';
        div.innerHTML = `
            <div class="q-info">
                <strong>${item.id} • ${item.name}</strong>
                <span>${DEPT_NAMES[item.dept]} | ⏰ ${item.slot} | Status: ${item.status}</span>
            </div>
            <button type="button" class="q-action-btn ${item.status === 'Seen' ? 'done' : ''}" ${item.status === 'Seen' ? 'disabled' : ''}>
                ${item.status === 'Seen' ? '✓ Seen' : `Mark ${nextStatus}`}
            </button>
        `;
        div.querySelector('button').addEventListener('click', () => {
            const all = getBookings();
            const target = all.find(b => b.id === item.id);
            if (target) target.status = nextStatus;
            saveBookings(all);
            renderStaffQueue();
            renderMyTicket();
        });
        list.appendChild(div);
    });
}

document.getElementById('reset-demo-btn').addEventListener('click', () => {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(MY_TICKET_KEY);
    renderSlotsAndCrowd();
    renderMyTicket();
    renderStaffQueue();
});

// Tab Switching
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

        const items = getBookings().filter(b => b.hospital === hosp && b.date === date);
    list.innerHTML = items.length ? '' : '<p class="empty-state">No bookings for this date.</p>';

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'q-item';
        const nextStatus = item.status === 'Confirmed' ? 'Checked In' : 'Seen';
        div.innerHTML = `
            <div class="q-info">
                <strong>${item.id} • ${item.name}</strong>
                <span>${DEPT_NAMES[item.dept]} | ⏰ ${item.slot} | Status: ${item.status}</span>
            </div>
            <button type="button" class="q-action-btn ${item.status === 'Seen' ? 'done' : ''}" ${item.status === 'Seen' ? 'disabled' : ''}>
                ${item.status === 'Seen' ? '✓ Seen' : `Mark ${nextStatus}`}
            </button>
        `;
        div.querySelector('button').addEventListener('click', () => {
            const all = getBookings();
            const target = all.find(b => b.id === item.id);
            if (target) target.status = nextStatus;
            saveBookings(all);
            renderStaffQueue();
            renderMyTicket();
        });
        list.appendChild(div);
    });
}

document.getElementById('reset-demo-btn').addEventListener('click', () => {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(MY_TICKET_KEY);
    renderSlotsAndCrowd();
    renderMyTicket();
    renderStaffQueue();
});

// Tab Switching
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.getElementById(`view-${tabName}`).classList.add('active');
}

document.getElementById('tab-patient').addEventListener('click', () => switchTab('patient'));
document.getElementById('tab-ticket').addEventListener('click', () => { renderMyTicket(); switchTab('ticket'); });
document.getElementById('tab-staff').addEventListener('click', () => { renderStaffQueue(); switchTab('staff'); });
document.getElementById('go-book-btn').addEventListener('click', () => switchTab('patient'));

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

renderSlotsAndCrowd();
renderMyTicket();

