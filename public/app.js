// =========================================================
// PASTE YOUR SUPABASE CREDENTIALS BELOW
// =========================================================
const SUPABASE_URL = "https://supabase.co";
const SUPABASE_ANON_KEY = sb_publishable_jnJt6-2gsHXdbMdQEEWL5w_00k4bsE1;
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
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes("PASTE_YOUR")
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

