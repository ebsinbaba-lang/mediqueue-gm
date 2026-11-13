// =========================================================
// SUPABASE CREDENTIALS (CONFIGURED)
// =========================================================
const SUPABASE_URL = "https://ggmsdvicirbfodswzilf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_jnJt6-2gsHXdbMdQEEWL5w_00k4bsE1";
// =========================================================

const STORAGE_KEY = "mediqueue_gm_bookings_v2";
const LAST_TICKET_KEY = "mediqueue_gm_last_ticket";
const SLOT_CAPACITY = 4;
const STAFF_PIN = "1234";

const HOSPITALS = {
  EFSTH: "EFSTH (Banjul)",
  KGH: "Kanifing General Hospital",
  SGH: "Serekunda General Hospital",
  BDH: "Brikama District Hospital"
};

const DEPARTMENTS = {
  OPD: "General OPD",
  MAT: "Maternity & Antenatal",
  PED: "Pediatrics",
  DEN: "Dental Clinic"
};

const TIME_SLOTS = [
  "08:30 - 09:00 AM",
  "09:00 - 09:30 AM",
  "09:30 - 10:00 AM",
  "10:00 - 10:30 AM",
  "10:30 - 11:00 AM",
  "11:00 - 11:30 AM",
  "11:30 - 12:00 PM",
  "12:00 - 12:30 PM",
  "12:30 - 01:00 PM",
  "01:00 - 01:30 PM"
];

const PRIORITY_WEIGHT = { Urgent: 1, Priority: 2, Routine: 3 };

let supabaseClient = null;
let allBookings = [];
let selectedSlot = null;
let staffUnlocked = false;

function getTodayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().split("T")[0];
}

function getSeedBookings() {
  const today = getTodayISO();
  return [
    {
      id: "EFSTH-OPD-101",
      hospital: "EFSTH",
      dept: "OPD",
      date: today,
      slot: "08:30 - 09:00 AM",
      name: "Mariama Touray",
      phone: "+220 701 2241",
      note: "Blood pressure follow-up",
      priority: "Priority",
      status: "Seen"
    },
    {
      id: "EFSTH-OPD-102",
      hospital: "EFSTH",
      dept: "OPD",
      date: today,
      slot: "08:30 - 09:00 AM",
      name: "Lamin Ceesay",
      phone: "+220 392 8810",
      note: "High fever & chills",
      priority: "Urgent",
      status: "Checked-In"
    },
    {
      id: "EFSTH-OPD-103",
      hospital: "EFSTH",
      dept: "OPD",
      date: today,
      slot: "09:00 - 09:30 AM",
      name: "Awa Njie",
      phone: "+220 981 4402",
      note: "General checkup",
      priority: "Routine",
      status: "Booked"
    },
    {
      id: "KGH-MAT-101",
      hospital: "KGH",
      dept: "MAT",
      date: today,
      slot: "09:00 - 09:30 AM",
      name: "Binta Camara",
      phone: "+220 512 7734",
      note: "Routine antenatal scan",
      priority: "Priority",
      status: "Checked-In"
    }
  ];
}

function isSupabaseConfigured() {
  return (
    window.supabase &&
    SUPABASE_URL.startsWith("https://") &&
    SUPABASE_ANON_KEY.length > 20
  );
}

function setSyncBadge(isCloud) {
  const badge = document.getElementById("syncStatusBadge");
  if (!badge) return;
  if (isCloud) {
    badge.textContent = "● Cloud Live";
    badge.classList.add("live");
  } else {
    badge.textContent = "Local Demo Mode";
    badge.classList.remove("live");
  }
}

async function initDataLayer() {
  if (isSupabaseConfigured()) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    setSyncBadge(true);
    await fetchFromSupabase();

    supabaseClient
      .channel("public:bookings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        async () => {
          await fetchFromSupabase();
          refreshAllViews();
        }
      )
      .subscribe();
  } else {
    setSyncBadge(false);
    const raw = localStorage.getItem(STORAGE_KEY);
    allBookings = raw ? JSON.parse(raw) : getSeedBookings();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allBookings));
  }
  refreshAllViews();
}

async function fetchFromSupabase() {
  const { data, error } = await supabaseClient
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: true });

  if (!error && data) {
    allBookings = data;
  }
}

async function saveNewBooking(ticket) {
  if (supabaseClient) {
    const { error } = await supabaseClient.from("bookings").insert([ticket]);
    if (error) {
      showToast("Cloud sync error: " + error.message);
      return false;
    }
    await fetchFromSupabase();
    return true;
  } else {
    allBookings.push(ticket);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allBookings));
    return true;
  }
}

async function updateBookingRecord(id, changes) {
  if (supabaseClient) {
    const { error } = await supabaseClient
      .from("bookings")
      .update(changes)
      .eq("id", id);
    if (!error) await fetchFromSupabase();
  } else {
    const target = allBookings.find((b) => b.id === id);
    if (target) Object.assign(target, changes);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allBookings));
  }
}

function refreshAllViews() {
  renderSlots();
  if (document.getElementById("panel-ticket").classList.contains("active")) {
    renderMyPass();
  }
  if (staffUnlocked) {
    renderStaffQueue();
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `panel-${tabName}`);
  });
  if (tabName === "ticket") renderMyPass();
  if (tabName === "staff" && staffUnlocked) renderStaffQueue();
}

function updateCrowdBanner() {
  const hospital = document.getElementById("hospitalSelect").value;
  const dept = document.getElementById("deptSelect").value;
  const date = document.getElementById("dateInput").value;
  const filtered = allBookings.filter(
    (b) => b.hospital === hospital && b.dept === dept && b.date === date
  );

  const totalCap = TIME_SLOTS.length * SLOT_CAPACITY;
  const count = filtered.length;
  const pct = Math.min(100, Math.round((count / totalCap) * 100));

  document.getElementById("bannerHospitalName").textContent = HOSPITALS[hospital];
  document.getElementById("bannerDeptName").textContent = `${DEPARTMENTS[dept]} • ${date}`;
  document.getElementById("crowdCountText").textContent = `${count} / ${totalCap} daily slots booked`;

  const fill = document.getElementById("crowdMeterFill");
  const pill = document.getElementById("crowdLevelBadge");
  const waitText = document.getElementById("crowdWaitText");

  fill.style.width = `${Math.max(8, pct)}%`;

  if (pct < 45) {
    pill.textContent = "Low Crowd";
    pill.className = "crowd-pill low";
    fill.style.background = "#0f766e";
    waitText.textContent = "Est. wait: ~10 mins";
  } else if (pct < 80) {
    pill.textContent = "Moderate Flow";
    pill.className = "crowd-pill moderate";
    fill.style.background = "#d97706";
    waitText.textContent = "Est. wait: ~20 mins";
  } else {
    pill.textContent = "High Demand";
    pill.className = "crowd-pill high";
    fill.style.background = "#dc2626";
    waitText.textContent = "Arrive strictly in window";
  }
}

function renderSlots() {
  const hospital = document.getElementById("hospitalSelect").value;
  const dept = document.getElementById("deptSelect").value;
  const date = document.getElementById("dateInput").value;
  const filtered = allBookings.filter(
    (b) => b.hospital === hospital && b.dept === dept && b.date === date
  );

  const grid = document.getElementById("slotsGrid");
  grid.innerHTML = "";

  TIME_SLOTS.forEach((slot) => {
    const taken = filtered.filter((b) => b.slot === slot).length;
    const left = SLOT_CAPACITY - taken;
    const isFull = left <= 0;

    if (selectedSlot === slot && isFull) selectedSlot = null;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn" + (selectedSlot === slot ? " selected" : "");
    btn.disabled = isFull;

    let capClass = "cap-open";
    let capText = `${left} spots left`;
    if (isFull) {
      capClass = "cap-full";
      capText = "FULL — Locked";
    } else if (left === 1) {
      capClass = "cap-low";
      capText = "1 spot left";
    }

    btn.innerHTML = `
      <span class="slot-time">${slot}</span>
      <span class="slot-cap ${capClass}">${capText}</span>
    `;

    btn.addEventListener("click", () => {
      selectedSlot = slot;
      renderSlots();
    });

    grid.appendChild(btn);
  });

  updateCrowdBanner();
}

function generateTicketId(hospital, dept) {
  const randomSuffix = Math.floor(100 + Math.random() * 899);
  return `${hospital}-${dept}-${randomSuffix}`;
}

async function handleBookingSubmit(e) {
  e.preventDefault();
  if (!selectedSlot) {
    showToast("Please select a 30-minute time window first.");
    return;
  }

  const submitBtn = document.getElementById("bookSubmitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Confirming Slot...";

  const hospital = document.getElementById("hospitalSelect").value;
  const dept = document.getElementById("deptSelect").value;
  const date = document.getElementById("dateInput").value;
  const priority = document.getElementById("prioritySelect").value;
  const name = document.getElementById("patientName").value.trim();
  const phone = document.getElementById("patientPhone").value.trim();
  const note = document.getElementById("visitNote").value.trim();

  if (supabaseClient) await fetchFromSupabase();

  const slotCount = allBookings.filter(
    (b) => b.hospital === hospital && b.dept === dept && b.date === date && b.slot === selectedSlot
  ).length;

  if (slotCount >= SLOT_CAPACITY) {
    showToast("That time slot just filled up. Please pick another.");
    selectedSlot = null;
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm Staggered Slot & Generate QR Pass";
    renderSlots();
    return;
  }

  const newTicket = {
    id: generateTicketId(hospital, dept),
    hospital,
    dept,
    date,
    slot: selectedSlot,
    name,
    phone,
    note: note || "General Consultation",
    priority,
    status: "Booked"
  };

  const ok = await saveNewBooking(newTicket);
  submitBtn.disabled = false;
  submitBtn.textContent = "Confirm Staggered Slot & Generate QR Pass";

  if (ok) {
    localStorage.setItem(LAST_TICKET_KEY, newTicket.id);
    document.getElementById("bookingForm").reset();
    selectedSlot = null;
    renderSlots();
    showToast(`Booked! Pass ${newTicket.id} synced.`);
    switchTab("ticket");
  }
}

function renderMyPass() {
  const container = document.getElementById("ticketContainer");
  const lastId = localStorage.getItem(LAST_TICKET_KEY);
  const ticket = allBookings.find((b) => b.id === lastId) || allBookings[allBookings.length - 1];

  if (!ticket) {
    container.innerHTML = `<div class="card"><p class="muted">No active appointment pass found. Book a time slot first.</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="ticket-pass">
      <div class="ticket-top">
        <div>
          <div style="font-size:0.75rem; opacity:0.88;">DIGITAL QR QUEUE PASS</div>
          <div class="ticket-code">${ticket.id}</div>
        </div>
        <span class="badge-live" style="background:#fff;">${ticket.status.toUpperCase()}</span>
      </div>

      <div class="qr-section">
        <div id="qrcodeBox"></div>
        <span class="qr-caption">Show this QR code at Hospital Reception for 2-second check-in</span>
      </div>

      <div class="ticket-body">
        <div class="ticket-row"><span class="ticket-label">Patient</span><span class="ticket-val">${ticket.name}</span></div>
        <div class="ticket-row"><span class="ticket-label">Triage Level</span><span class="ticket-val"><span class="prio-tag prio-${ticket.priority || 'Routine'}">${ticket.priority || 'Routine'}</span></span></div>
        <div class="ticket-row"><span class="ticket-label">Hospital</span><span class="ticket-val">${HOSPITALS[ticket.hospital]}</span></div>
        <div class="ticket-row"><span class="ticket-label">Department</span><span class="ticket-val">${DEPARTMENTS[ticket.dept]}</span></div>
        <div class="ticket-row"><span class="ticket-label">Date</span><span class="ticket-val">${ticket.date}</span></div>
        <div class="ticket-row"><span class="ticket-label">Arrival Window</span><span class="ticket-val" style="color:#0f766e;">${ticket.slot}</span></div>
      </div>

      <div class="ticket-actions">
        <button class="btn-primary" id="copyWhatsappBtn">Copy for WhatsApp</button>
        <button class="btn-outline" id="newBookingBtn">Book Another</button>
      </div>
    </div>
  `;

  if (window.QRCode) {
    new QRCode(document.getElementById("qrcodeBox"), {
      text: JSON.stringify({
        id: ticket.id,
        hospital: ticket.hospital,
        dept: ticket.dept,
        slot: ticket.slot,
        priority: ticket.priority || "Routine"
      }),
      width: 136,
      height: 136,
      colorDark: "#0f172a",
      colorLight: "#ffffff"
    });
  }

  document.getElementById("copyWhatsappBtn").addEventListener("click", () => {
    const text =
      `*MediQueue GM — Appointment Pass*\n` +
      `Ticket ID: *${ticket.id}* (${ticket.priority || "Routine"})\n` +
      `Patient: ${ticket.name}\n` +
      `Hospital: ${HOSPITALS[ticket.hospital]}\n` +
      `Department: ${DEPARTMENTS[ticket.dept]}\n` +
      `Date: ${ticket.date}\n` +
      `Arrival Window: *${ticket.slot}*`;

    navigator.clipboard.writeText(text).then(() => {
      showToast("Pass copied! Ready to paste in WhatsApp.");
    });
  });

  document.getElementById("newBookingBtn").addEventListener("click", () => switchTab("patient"));
}

function renderStaffQueue() {
  const hospFilter = document.getElementById("staffHospitalFilter").value;
  const deptFilter = document.getElementById("staffDeptFilter").value;

  const filtered = allBookings
    .filter((b) => {
      const matchHosp = hospFilter === "ALL" || b.hospital === hospFilter;
      const matchDept = deptFilter === "ALL" || b.dept === deptFilter;
      return matchHosp && matchDept;
    })
    .sort((a, b) => {
      const wA = PRIORITY_WEIGHT[a.priority || "Routine"] || 3;
      const wB = PRIORITY_WEIGHT[b.priority || "Routine"] || 3;
      return wA - wB;
    });

  document.getElementById("kpiTotal").textContent = filtered.length;
  document.getElementById("kpiUrgent").textContent = filtered.filter(
    (b) => (b.priority === "Urgent" || b.priority === "Priority") && b.status !== "Seen"
  ).length;
  document.getElementById("kpiCheckedIn").textContent = filtered.filter((b) => b.status === "Checked-In").length;
  document.getElementById("kpiSeen").textContent = filtered.filter((b) => b.status === "Seen").length;

  const list = document.getElementById("staffQueueList");
  if (filtered.length === 0) {
    list.innerHTML = `<div class="card"><p class="muted">No patient bookings match this filter.</p></div>`;
    return;
  }

  list.innerHTML = filtered
    .map((item) => {
      const prio = item.priority || "Routine";
      const statusClass =
        item.status === "Seen"
          ? "status-seen"
          : item.status === "Checked-In"
          ? "status-checked-in"
          : "status-booked";

      return `
        <div class="queue-item border-${prio}">
          <div class="queue-meta">
            <h4>${item.id} — ${item.name} <span class="prio-tag prio-${prio}">${prio}</span></h4>
            <p>${HOSPITALS[item.hospital]} • ${DEPARTMENTS[item.dept]}</p>
            <p><strong>${item.slot}</strong> (${item.date}) • ${item.phone}</p>
            <p>Note: ${item.note}</p>
            <span class="status-tag ${statusClass}">${item.status}</span>
          </div>
          <div class="queue-btns">
            ${
              item.status === "Booked"
                ? `<button class="btn-secondary btn-sm" onclick="updatePatientStatus('${item.id}', 'Checked-In')">Check In</button>`
                : ""
            }
            ${
              item.status !== "Seen"
                ? `<button class="btn-primary btn-sm" onclick="updatePatientStatus('${item.id}', 'Seen')">Mark Seen</button>`
                : `<span class="muted" style="font-size:0.75rem;">Completed</span>`
            }
            ${
              prio !== "Urgent" && item.status !== "Seen"
                ? `<button class="btn-danger btn-sm" onclick="escalatePriority('${item.id}')">Flag Urgent</button>`
                : ""
            }
          </div>
        </div>
      `;
    })
    .join("");
}

window.updatePatientStatus = async function (id, newStatus) {
  await updateBookingRecord(id, { status: newStatus });
  refreshAllViews();
  showToast(`${id} marked as ${newStatus}`);
};

window.escalatePriority = async function (id) {
  await updateBookingRecord(id, { priority: "Urgent" });
  refreshAllViews();
  showToast(`${id} escalated to URGENT priority!`);
};

function applyPortalMode() {
  const params = new URLSearchParams(window.location.search);
  const isStaffPortal = params.get("staff") === "1";
  const tabPatient = document.getElementById("tabPatient");
  const tabTicket = document.getElementById("tabTicket");
  const tabStaff = document.getElementById("tabStaff");
  const crowdBanner = document.getElementById("crowdBanner");
  const subtitle = document.querySelector(".subtitle");

  if (isStaffPortal) {
    if (tabPatient) tabPatient.style.display = "none";
    if (tabTicket) tabTicket.style.display = "none";
    if (crowdBanner) crowdBanner.style.display = "none";
    if (subtitle) subtitle.textContent = "Hospital Reception & Clinical Triage Workstation";
    switchTab("staff");
  } else {
    if (tabStaff) tabStaff.style.display = "none";
    switchTab("patient");
  }
}

function init() {
  const dateInput = document.getElementById("dateInput");
  dateInput.value = getTodayISO();
  dateInput.min = getTodayISO();

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  ["hospitalSelect", "deptSelect", "dateInput"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      selectedSlot = null;
      renderSlots();
    });
  });

  document.getElementById("bookingForm").addEventListener("submit", handleBookingSubmit);

  document.getElementById("unlockStaffBtn").addEventListener("click", () => {
    const pin = document.getElementById("staffPinInput").value;
    if (pin === STAFF_PIN) {
      staffUnlocked = true;
      document.getElementById("staffLockCard").classList.add("hidden");
      document.getElementById("staffDashboard").classList.remove("hidden");
      document.getElementById("pinError").textContent = "";
      renderStaffQueue();
    } else {
      document.getElementById("pinError").textContent = "Incorrect PIN. Try 1234.";
    }
  });

  document.getElementById("lockStaffBtn").addEventListener("click", () => {
    staffUnlocked = false;
    document.getElementById("staffPinInput").value = "";
    document.getElementById("staffDashboard").classList.add("hidden");
    document.getElementById("staffLockCard").classList.remove("hidden");
  });

    let html5QrInstance = null;

  async function processScannedTicket(rawText) {
    let ticketId = rawText.trim();
    try {
      const parsed = JSON.parse(ticketId);
      if (parsed && parsed.id) ticketId = parsed.id;
    } catch (_) {}

    const match = allBookings.find((b) => b.id.toLowerCase() === ticketId.toLowerCase());
    if (match) {
      await updateBookingRecord(match.id, { status: "Checked-In" });
      refreshAllViews();
      showToast(`QR Verified: ${match.name} (${match.id}) Checked In!`);
      stopQrScanner();
    } else {
      showToast(`Ticket "${ticketId}" not found.`);
    }
  }

  async function stopQrScanner() {
    const box = document.getElementById("qrScannerBox");
    if (html5QrInstance) {
      try {
        await html5QrInstance.stop();
        html5QrInstance.clear();
      } catch (_) {}
      html5QrInstance = null;
    }
    if (box) box.classList.add("hidden");
  }

  document.getElementById("quickScanBtn").addEventListener("click", async () => {
    const box = document.getElementById("qrScannerBox");
    box.classList.remove("hidden");

    if (!window.Html5Qrcode) {
      showToast("Camera library unavailable. Use manual ID box below.");
      return;
    }

    if (html5QrInstance) return;
    html5QrInstance = new Html5Qrcode("qrReaderView");

    try {
      await html5QrInstance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decodedText) => {
          await processScannedTicket(decodedText);
        }
      );
    } catch (err) {
      html5QrInstance = null;
      showToast("Camera blocked or unavailable — enter Ticket ID manually.");
    }
  });

  document.getElementById("closeScannerBtn").addEventListener("click", stopQrScanner);

  document.getElementById("manualCheckInBtn").addEventListener("click", async () => {
    const input = document.getElementById("manualTicketInput");
    if (!input.value.trim()) return;
    await processScannedTicket(input.value);
    input.value = "";
  });


  document.getElementById("staffHospitalFilter").addEventListener("change", renderStaffQueue);
  document.getElementById("staffDeptFilter").addEventListener("change", renderStaffQueue);

  initDataLayer();
  applyPortalMode();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);
