(() => {
	const cfg = window.PLANNER_CONFIG;

	// Storage keys
	const LS_PATIENTS = "planner_patients";   // object: { "2025-11-12": [patient,...] }
	const LS_STAFF = "planner_staff";         // array: [staff,...] (global)
	const LS_EVENTS = "planner_events";       // array: [eventTemplate,...] (global)
	const LS_SCHEDULE = "planner_schedule";   // object: { "2025-11-12": [scheduledEvent,...] }

	const $ = (sel, root = document) => root.querySelector(sel);
	const byId = id => document.getElementById(id);

	const state = {
		date: new Date(),
		patients: [],     // current date's patients
		staff: [],        // global staff templates
		events: [],       // global event templates
		scheduled: [],    // scheduled events for selected date
		dragging: null,
		resizing: null
	};

	function loadLS(key, fallback) {
		try {
			return JSON.parse(localStorage.getItem(key)) || fallback;
		} catch {
			return fallback;
		}
	}

	function saveLS(key, value) {
		localStorage.setItem(key, JSON.stringify(value));
	}

	function ymd(date) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().slice(0, 10);
	}

	function clampDateToHorizon(d) {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const min = new Date(today);
		min.setDate(min.getDate() - cfg.pastDays);  // cfg.pastDays = number of days allowed in past
		const max = new Date(today);
		max.setDate(max.getDate() + (cfg.horizonDays - 1));
		if (d < min) return min;
		if (d > max) return max;
		return d;
	}

	// ---------- Load / Save all relevant data ----------
	function loadAllForDate() {
		// patients per date (object keyed by ymd)
		const allPatients = loadLS(LS_PATIENTS, {});
		state.patients = allPatients[ymd(state.date)] || [];

		// global staff
		state.staff = loadLS(LS_STAFF, []);

		// global event templates
		state.events = loadLS(LS_EVENTS, []);

		// scheduled events for this date
		const schedule = loadLS(LS_SCHEDULE, {});
		state.scheduled = schedule[ymd(state.date)] || [];
	}

	function saveAll() {
		// Save patients keyed by date
		const allPatients = loadLS(LS_PATIENTS, {});
		allPatients[ymd(state.date)] = state.patients;
		saveLS(LS_PATIENTS, allPatients);

		// Save staff and templates
		saveLS(LS_STAFF, state.staff);
		saveLS(LS_EVENTS, state.events);

		// Save schedule keyed by date (merge with other dates)
		const allSchedules = loadLS(LS_SCHEDULE, {});
		allSchedules[ymd(state.date)] = state.scheduled;
		saveLS(LS_SCHEDULE, allSchedules);
	}

	// ---------- Init ----------
	async function init() {
		state.date = clampDateToHorizon(new Date());
		byId("date-picker").value = ymd(state.date);
		loadAllForDate();
		renderSidebar();
		renderGrid();
		bindTopbar();
	}

	// ---------- Rendering ----------

	function renderSidebar() {
		// Patients list
		const plist = byId("patient-list");
		plist.innerHTML = "";
		state.patients.forEach((p, idx) => {
			const li = document.createElement("li");
			li.className = "flex items-center justify-between mb-2 p-2 bg-gray-100 rounded shadow-sm";

			const input = document.createElement("input");
			input.value = p.name || "";
			input.placeholder = `Patient ${idx + 1}`;
			input.className = "border border-gray-300 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500";
			input.addEventListener("change", () => {
				p.name = input.value.trim();
				saveAll();
				renderHeader();
				refresh();
			});

			const del = document.createElement("button");
			del.textContent = "✕";
			del.className = "ml-2 text-red-500 hover:text-red-700 font-bold";
			del.addEventListener("click", () => {
				state.patients.splice(idx, 1);
				saveAll();
				state.scheduled = state.scheduled.filter(e => e.patientId !== p.id);
				saveAll();
				renderSidebar();
				refresh();
			});

			li.appendChild(input);
			li.appendChild(del);
			plist.appendChild(li);
		});
		byId("patient-count").textContent = `(${state.patients.length}/${cfg.maxPatients})`;

		// Staff list
		const slist = byId("staff-list");
		slist.innerHTML = "";
		state.staff.forEach((s, idx) => {
			const li = document.createElement("li");
			li.className = "flex flex-wrap gap-y-2 items-center justify-between mb-2 p-2 bg-gray-100 rounded shadow-sm";

			const tag = document.createElement("div");
			tag.className = `px-2 w-full py-1 rounded cursor-pointer text-white ${s.color ? "bg-[" + s.color + "]" : "bg-blue-500"} font-medium`;
			tag.textContent = s.name || "Unnamed";
			tag.draggable = true;
			tag.dataset.staffId = s.id;

			// Make staff editable on dblclick
			tag.addEventListener("dblclick", () => {
				const input = document.createElement("input");
				input.type = "text";
				input.value = s.name;
				input.className = "border border-gray-300 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500";
				input.addEventListener("keydown", e => {
					if (e.key === "Enter") input.blur();
				});
				input.addEventListener("blur", () => {
					s.name = input.value.trim() || s.name;
					saveAll();
					renderSidebar(); // re-render
				});
				li.replaceChild(input, tag);
				input.focus();
			});

			// dragstart for staff
			tag.addEventListener("dragstart", e => {
				e.dataTransfer.setData("text/plain", JSON.stringify({ type: "staff", id: s.id }));
				e.dataTransfer.effectAllowed = "copy";
			});

			// Remove this staff from all scheduled events
			const delAllEvtBtn = document.createElement("button");
			delAllEvtBtn.textContent = "❌ All Events";
			delAllEvtBtn.title = "Remove staff from all scheduled events (today)";
			delAllEvtBtn.className = "px-2 py-1 text-sm text-gray-700 hover:text-gray-900 bg-gray-200 rounded w-2/4";
			delAllEvtBtn.addEventListener("click", () => {
				if (confirm(`Remove ${s.name} from all scheduled events for this date?`)) {
					state.scheduled.forEach(ev => { ev.staff = ev.staff.filter(id => id !== s.id); });
					saveAll();
					refresh();
				}
			});

			// Delete staff completely (remove from staff list + remove from events)
			const deleteStaffBtn = document.createElement("button");
			deleteStaffBtn.textContent = "❌ Delete";
			deleteStaffBtn.title = "Delete staff entirely (also removes from events)";
			deleteStaffBtn.className = "px-2 py-1 text-sm text-gray-700 hover:text-gray-900 bg-gray-200 rounded w-[49%]";
			deleteStaffBtn.addEventListener("click", () => {
				if (confirm(`Delete staff ${s.name} completely and remove from all events?`)) {
					// Remove staff from scheduled events
					state.scheduled.forEach(ev => { ev.staff = ev.staff.filter(id => id !== s.id); });
					// Remove staff from staff array
					state.staff = state.staff.filter(st => st.id !== s.id);
					saveAll();
					renderSidebar();
					refresh();
				}
			});

			li.appendChild(tag);
			li.appendChild(delAllEvtBtn);
			li.appendChild(deleteStaffBtn); // <-- added delete button
			slist.appendChild(li);
		});

		// Event templates
		const evtList = byId("event-list");
		evtList.innerHTML = "";
		state.events.forEach(evt => {
			const li = document.createElement("li");
			li.className = `relative flex flex-col p-2 mb-2 bg-white border-2 border-[${evt.color}] rounded shadow cursor-pointer hover:shadow-md transition-shadow duration-150`;
			li.draggable = true;
			li.dataset.id = evt.id;

			const info = document.createElement("div");
			info.className = "font-semibold text-gray-800";
			info.textContent = evt.title || "Untitled";

			const desc = document.createElement("div");
			desc.className = "text-sm text-gray-500 mt-1";
			desc.textContent = evt.description || ""; // <-- description displayed

			const dur = document.createElement("div");
			dur.className = "text-sm text-gray-500 mt-1";
			dur.textContent = `${evt.duration} mins`;

			const del = document.createElement("button");
			del.textContent = "✕";
			del.className = "absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold";
			del.addEventListener("click", e => {
				e.stopPropagation();
				state.events = state.events.filter(e => e.id !== evt.id);
				saveAll();
				renderSidebar();
				refresh();
			});

			li.appendChild(info);
			li.appendChild(desc); // <-- append description
			li.appendChild(dur);
			li.appendChild(del);

			li.addEventListener("dragstart", e => {
				e.dataTransfer.setData("text/plain", JSON.stringify({ type: "event-template", id: evt.id }));
				e.dataTransfer.effectAllowed = "copy";
			});

			li.addEventListener("dblclick", () => {
				// Find scheduled event instance if exists
				const sched = state.scheduled.find(s => s.title === evt.title && s.patientId === null) || {
					...evt,
					id: crypto.randomUUID(),
					patientId: null,
					start: minutesToTime(cfg.startHour * 60),
					end: minutesToTime(cfg.startHour * 60 + evt.duration),
					staff: [...(evt.staff || [])],
				};
				openModalEditorForEvent(sched);
			});

			evtList.appendChild(li);
		});

		byId("event-count").textContent = `(${state.events.length})`;
	}

	function renderHeader() {
		const header = byId("planner-header");
		header.innerHTML = "";
		const row = document.createElement("div");
		row.className = "grid border-b border-gray-300";
		row.style.setProperty("--col-template", colTemplate());

		const timeCell = document.createElement("div");
		timeCell.className = "p-2 font-bold text-gray-700 border-r border-gray-300";
		timeCell.textContent = ymd(state.date);
		row.appendChild(timeCell);

		state.patients.forEach(p => {
			const cell = document.createElement("div");
			cell.className = "p-2 font-medium text-gray-600 border-r border-gray-300";
			cell.textContent = p.name || "—";
			row.appendChild(cell);
		});

		header.appendChild(row);
	}

	function colTemplate() {
		const cols = Math.max(1, state.patients.length);
		return `repeat(${cols}, minmax(300px,1fr))`;
	}

	function renderGrid() {
		renderHeader();
		const planner = byId("planner");
		planner.innerHTML = "";
		planner.style.setProperty("--col-template", colTemplate());

		const grid = document.createElement("div");
		grid.className = "grid ";

		// Time gutter
		const totalSlots = ((cfg.endHour - cfg.startHour) * 60) / cfg.slotMinutes;
		const gutter = document.createElement("div");
		gutter.className = "timer flex flex-col w-full border-r border-gray-200 text-right text-sm text-gray-500";
		for (let i = 0; i <= totalSlots; i++) {
			const mins = cfg.startHour * 60 + i * cfg.slotMinutes;
			const slot = document.createElement("div");
			slot.className = "h-10 flex items-center justify-center border-b border-gray-100";
			slot.textContent = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
			gutter.appendChild(slot);
		}
		grid.appendChild(gutter);

		const colsWrap = document.createElement("div");
		colsWrap.style.display = "contents";

		// create column per patient
		state.patients.forEach(p => {
			const col = document.createElement("div");
			col.className = "col relative flex-1 border-l border-gray-200 w-full";
			col.dataset.patientId = p.id;

			for (let i = 0; i < totalSlots; i++) {
				const cell = document.createElement("div");
				cell.className = "cell h-10 border-b border-gray-100";
				cell.dataset.slot = i;

				// drop handler: handle event-template -> create scheduled event
				cell.addEventListener("dragover", e => e.preventDefault());
				cell.addEventListener("drop", e => {
					e.preventDefault();
					try {
						const data = JSON.parse(e.dataTransfer.getData("text/plain"));
						if (data.type === "event-template") {
							const tpl = state.events.find(t => t.id === data.id);
							if (!tpl) return;
							const startMins = cfg.startHour * 60 + i * cfg.slotMinutes;
							const scheduled = {
								id: crypto.randomUUID(),
								title: tpl.title || "Untitled",
								description: tpl.description || "", // <-- add this line
								color: tpl.color || "#4e79a7",
								duration: tpl.duration || cfg.defaultDuration,
								staff: [...(tpl.staff || [])],
								date: ymd(state.date),
								patientId: p.id,
								start: minutesToTime(startMins),
								end: minutesToTime(startMins + (tpl.duration || cfg.defaultDuration))
							};
							state.scheduled.push(scheduled);
							saveAll();
							refresh();
						} else if (data.type === "event-scheduled") {
							// allow dropping a scheduled event onto another patient column -> reassign patient & start time
							const sched = state.scheduled.find(s => s.id === data.id);
							if (!sched) return;
							const startMins = cfg.startHour * 60 + i * cfg.slotMinutes;
							sched.patientId = p.id;
							sched.start = minutesToTime(startMins);
							sched.end = minutesToTime(startMins + (timeToMinutes(sched.end) - timeToMinutes(sched.start)));
							saveAll();
							refresh();
						}
					} catch (err) {
						// ignore parse errors
					}
				});

				// double-click to create scheduled event directly (quick create)
				cell.addEventListener("dblclick", () => {
					const startMins = cfg.startHour * 60 + i * cfg.slotMinutes;

					// Store quick create info in the modal
					const modal = byId("eventModal");
					modal.dataset.quickCreate = JSON.stringify({
						patientId: p.id,
						startMins: startMins
					});

					// Clear modal fields
					byId("eventTitle").value = "";
					byId("eventDuration").value = 30; // default
					byId("eventColor").value = "#4e79a7";
					byId("eventDescription").value = "";

					modal.classList.remove("hidden");
				});

				col.appendChild(cell);
			}

			colsWrap.appendChild(col);
		});

		grid.appendChild(colsWrap);
		planner.appendChild(grid);

		// render scheduled events for this date
		state.scheduled.forEach(e => renderScheduledEvent(e));
	}

	function minutesToTime(mins) {
		return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
	}

	function timeToMinutes(t) {
		if (!t) return 0;
		const [h, m] = t.split(":").map(Number);
		return h * 60 + m;
	}

	// Render a scheduled event (the ones that live on the grid)
	function renderScheduledEvent(evt) {
		// find column for patient
		const col = $(`.col[data-patient-id="${evt.patientId}"]`);
		if (!col) return;

		const startM = timeToMinutes(evt.start);
		const endM = timeToMinutes(evt.end);
		const totalMinutes = (cfg.endHour - cfg.startHour) * 60;
		const slotH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--slot-height")) || 28;
		const colHeight = (totalMinutes / cfg.slotMinutes) * slotH;
		const top = ((startM - cfg.startHour * 60) / totalMinutes) * colHeight;
		const height = ((endM - startM) / totalMinutes) * colHeight;

		const el = document.createElement("div");
		el.className = "event absolute left-0 right-0 rounded shadow p-1 text-white cursor-move";
		el.dataset.id = evt.id;
		el.dataset.scheduled = "1";
		el.style.top = `${top}px`;
		el.style.height = `${Math.max(24, height - 4)}px`;
		el.style.background = evt.color || "#4e79a7";

		// allow dragging scheduled event to reassign or move
		el.draggable = true;
		el.addEventListener("dragstart", e => {
			e.dataTransfer.setData("text/plain", JSON.stringify({ type: "event-scheduled", id: evt.id }));
			e.dataTransfer.effectAllowed = "move";
		});

		el.addEventListener("mousedown", startDrag); // reuse drag/resize logic

		// resize handles
		const ht = document.createElement("div");
		ht.className = "handles handle-top";
		ht.addEventListener("mousedown", startResizeTop);
		const hb = document.createElement("div");
		hb.className = "handles handle-bottom";
		hb.addEventListener("mousedown", startResizeBottom);
		el.appendChild(ht);
		el.appendChild(hb);

		// content
		const line = document.createElement("p");
		line.className = `
			text-white 
			m-0 p-0 
			text-[14px] 
			drop-shadow-[1px_1px_2px_rgba(0,0,0,0.7)]
			capitalize
		`;

		if (evt.description && evt.description.trim() !== "") {
			line.innerHTML = `${evt.title} - <span class="text-[12px]">${evt.description}</span>`;
		} else {
			line.textContent = evt.title; // only title, no dash
		}

		// Staff chips with initials
		const meta = document.createElement("div");
		meta.className = "flex flex-wrap gap-1 mt-1 absolute -bottom-3 -left-3 ";

		meta.addEventListener("pointerdown", e => {
			e.preventDefault(); // remove preventDefault
			e.stopPropagation(); // remove preventDefault
		});

		evt.staff.forEach(staffId => {
			const staff = state.staff.find(s => s.id === staffId);
			if (!staff) return;

			// Create chip
			const chip = document.createElement("div");
			console.log({ staff })
			chip.className = `bg-white text-black w-6 h-6 rounded flex items-center justify-center cursor-pointer transition bg-[${staff.color || "#4e79a7"}] z-[1] rounded-full`;

			// Convert full name to initials
			const firstLetter = staff.name.trim()[0].toUpperCase();
			chip.textContent = firstLetter;
			chip.addEventListener("pointerdown", e => {
				e.preventDefault(); // remove preventDefault
				e.stopPropagation(); // remove preventDefault
			});

			// Click to remove with confirmation
			chip.addEventListener("click", e => {
				e.stopPropagation();
				if (confirm(`Remove ${staff.name} from this event?`)) {
					evt.staff = evt.staff.filter(id => id !== staffId);
					saveAll();
					refresh();
				}
			});

			meta.appendChild(chip);
		});

		el.appendChild(line);
		el.appendChild(meta);

		const menuBtn = document.createElement("button");
		menuBtn.className = "absolute top-2/4 right-1 w-6 rounded-full -translate-y-2/4 text-black bg-white transition hover:bg-gray-300";
		menuBtn.textContent = "⋮";
		menuBtn.title = "Actions";
		menuBtn.draggable = false; // important!
		menuBtn.addEventListener("pointerdown", e => {
			e.stopPropagation(); // remove preventDefault
		});

		// dropdown container
		const dropdown = document.createElement("div");
		dropdown.className = "absolute top-full right-0 w-28 bg-white text-black rounded shadow-xl hidden flex-col border";
		dropdown.style.zIndex = 9999; // ensure it appears on top
		dropdown.draggable = false;

		// Edit option
		const editBtn = document.createElement("button");
		editBtn.className = "px-2 py-1 text-left hover:bg-gray-200 w-full";
		editBtn.textContent = "Edit";
		editBtn.addEventListener("pointerdown", e => {
			e.stopPropagation();
			e.preventDefault();
		});
		editBtn.addEventListener("click", e => {
			e.stopPropagation();
			openModalEditorForEvent(evt);
			dropdown.classList.add("hidden");
		});

		// Delete option
		const deleteBtn = document.createElement("button");
		deleteBtn.className = "px-2 py-1 text-left hover:bg-gray-200 w-full text-red-600";
		deleteBtn.textContent = "Delete";
		deleteBtn.addEventListener("pointerdown", e => {
			e.stopPropagation();
			e.preventDefault();
		});
		deleteBtn.addEventListener("click", e => {
			console.log('here')
			e.stopPropagation();
			state.scheduled = state.scheduled.filter(s => s.id !== evt.id);
			saveAll();
			refresh();
		});

		// Append buttons to dropdown
		dropdown.appendChild(editBtn);
		dropdown.appendChild(deleteBtn);

		menuBtn.addEventListener("pointerdown", e => {
			e.stopPropagation();
			e.preventDefault();
		});

		// Toggle dropdown on menu click
		menuBtn.addEventListener("click", e => {
			e.stopPropagation();
			dropdown.classList.toggle("hidden");
		});

		// Append to event element
		el.appendChild(menuBtn);
		el.appendChild(dropdown);

		// accept staff drops onto scheduled event
		el.addEventListener("dragover", e => e.preventDefault());
		el.addEventListener("drop", e => {
			e.preventDefault();
			try {
				const data = JSON.parse(e.dataTransfer.getData("text/plain"));
				if (data.type === "staff") {
					const staffId = data.id;
					if (!evt.staff.includes(staffId)) {
						evt.staff.push(staffId);
						saveAll();
						refresh();
					}
				}
			} catch (err) { }
		});
		// double click to edit scheduled event
		el.addEventListener("dblclick", () => openModalEditorForEvent(evt));

		col.appendChild(el);
	}

	// ---------- Sidebar editors ----------

	function openModalEditorForEvent(evt) {
		editingEvent = evt;

		const modal = byId("editEventModal");
		byId("editEventTitle").value = evt.title;
		byId("editEventStart").value = evt.start;
		byId("editEventDuration").value = evt.duration;
		byId("editEventColor").value = evt.color;
		byId("editEventDescription").value = evt.description || "";

		modal.classList.remove("hidden");
	}

	// ---------- Drag + Resize logic (reused & adapted) ----------
	let dragStartY = 0;
	let dragStartTop = 0;
	let dragStartX = 0;
	let dragStartColIndex = 0;

	let resizeStartY = 0;
	let resizeStartTop = 0;
	let resizeStartHeight = 0;

	function getGridMetrics() {
		const slotH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--slot-height")) || 28;
		const firstCol = document.querySelector(".col");
		const colWidth = firstCol ? firstCol.offsetWidth : 180;
		return { slotH, colWidth };
	}

	function startDrag(e) {
		// ignore if clicking a handle
		if (e.target.classList.contains("handles")) return;

		const el = e.currentTarget;
		const id = el.dataset.id;

		dragStartY = e.clientY;
		dragStartTop = parseFloat(el.style.top) || 0;
		dragStartX = e.clientX;

		const cols = [...document.querySelectorAll(".col")];
		dragStartColIndex = cols.findIndex(c => c.contains(el));

		state.dragging = { id };

		document.addEventListener("mousemove", onDrag);
		document.addEventListener("mouseup", endDrag);

		e.preventDefault();
	}

	function onDrag(e) {
		if (!state.dragging) return;
		const el = document.querySelector(`.event[data-id="${state.dragging.id}"]`);
		if (!el) return;
		const { slotH, colWidth } = getGridMetrics();

		const dy = e.clientY - dragStartY;
		let newTop = dragStartTop + dy;
		newTop = Math.round(newTop / slotH) * slotH;
		newTop = Math.max(0, newTop);
		el.style.top = `${newTop}px`;

		const dx = e.clientX - dragStartX;
		const cols = [...document.querySelectorAll(".col")];
		let targetIndex = dragStartColIndex + Math.round(dx / colWidth);
		targetIndex = Math.max(0, Math.min(cols.length - 1, targetIndex));
		const targetCol = cols[targetIndex];
		if (!targetCol.contains(el)) targetCol.appendChild(el);
	}

	function endDrag(e) {
		if (!state.dragging) return;
		const id = state.dragging.id;
		const el = document.querySelector(`.event[data-id="${id}"]`);
		const sched = state.scheduled.find(x => x.id === id);
		if (!el || !sched) {
			state.dragging = null;
			document.removeEventListener("mousemove", onDrag);
			document.removeEventListener("mouseup", endDrag);
			return;
		}

		const { slotH } = getGridMetrics();
		let newTop = parseFloat(el.style.top) || 0;
		const totalSlots = ((cfg.endHour - cfg.startHour) * 60) / cfg.slotMinutes;

		// day overflow logic (keep on same day only for now)
		if (newTop < 0) newTop = 0;
		if (newTop > totalSlots * slotH) newTop = totalSlots * slotH - slotH;

		const slotIndex = Math.round(newTop / slotH);
		const startMinutes = cfg.startHour * 60 + slotIndex * cfg.slotMinutes;

		const duration = sched.duration || (timeToMinutes(sched.end) - timeToMinutes(sched.start));
		sched.start = minutesToTime(startMinutes);
		sched.end = minutesToTime(startMinutes + duration);

		// update patientId based on column
		const colEl = el.closest(".col");
		if (colEl) sched.patientId = colEl.dataset.patientId;

		saveAll();
		refresh();

		state.dragging = null;
		document.removeEventListener("mousemove", onDrag);
		document.removeEventListener("mouseup", endDrag);
	}

	// Resize handlers
	function startResizeTop(e) {
		const el = e.currentTarget.parentElement;
		const id = el.dataset.id;
		resizeStartY = e.clientY;
		resizeStartTop = parseFloat(el.style.top) || 0;
		resizeStartHeight = parseFloat(el.style.height) || 0;
		state.resizing = { id, edge: "top" };
		document.addEventListener("mousemove", onResize);
		document.addEventListener("mouseup", endResize);
		e.stopPropagation();
		e.preventDefault();
	}

	function startResizeBottom(e) {
		const el = e.currentTarget.parentElement;
		const id = el.dataset.id;
		resizeStartY = e.clientY;
		resizeStartTop = parseFloat(el.style.top) || 0;
		resizeStartHeight = parseFloat(el.style.height) || 0;
		state.resizing = { id, edge: "bottom" };
		document.addEventListener("mousemove", onResize);
		document.addEventListener("mouseup", endResize);
		e.stopPropagation();
		e.preventDefault();
	}

	function onResize(e) {
		if (!state.resizing) return;
		const el = document.querySelector(`.event[data-id="${state.resizing.id}"]`);
		if (!el) return;

		const { slotH } = getGridMetrics();
		const dy = e.clientY - resizeStartY;

		let newTop = resizeStartTop;
		let newHeight = resizeStartHeight;

		if (state.resizing.edge === "top") {
			newTop = resizeStartTop + dy;
			newTop = Math.round(newTop / slotH) * slotH;
			newTop = Math.max(0, newTop);
			newHeight = resizeStartHeight - (newTop - resizeStartTop);
		} else {
			newHeight = resizeStartHeight + dy;
		}

		newHeight = Math.max(slotH, Math.round(newHeight / slotH) * slotH);

		el.style.top = `${newTop}px`;
		el.style.height = `${newHeight}px`;

		// --- Update state in real-time ---
		const evt = state.scheduled.find(ev => ev.id === el.dataset.id);
		if (evt) {
			const totalMinutes = (cfg.endHour - cfg.startHour) * 60;
			const colHeight = (totalMinutes / cfg.slotMinutes) * slotH;
			const startMinutes = cfg.startHour * 60 + (newTop / colHeight) * totalMinutes;
			const endMinutes = startMinutes + (newHeight / colHeight) * totalMinutes;
			evt.start = minutesToTime(Math.round(startMinutes));
			evt.end = minutesToTime(Math.round(endMinutes));
			evt.duration = Math.round(endMinutes - startMinutes);
		}
	}

	function endResize(e) {
		if (!state.resizing) return;
		saveAll();
		refresh(); // re-render grid with updated times
		state.resizing = null;
		document.removeEventListener("mousemove", onResize);
		document.removeEventListener("mouseup", endResize);
	}

	// ---------- Topbar & buttons ----------
	function bindTopbar() {
		const dp = byId("date-picker");
		dp.addEventListener("change", () => {
			state.date = clampDateToHorizon(new Date(dp.value));
			byId("date-picker").value = ymd(state.date);
			loadAllForDate();
			renderSidebar();
			renderGrid();
		});

		byId("prev-day").addEventListener("click", () => {
			const d = new Date(state.date);
			d.setDate(d.getDate() - 1);
			state.date = clampDateToHorizon(d);
			dp.value = ymd(state.date);
			loadAllForDate();
			renderSidebar();
			renderGrid();
		});

		byId("next-day").addEventListener("click", () => {
			const d = new Date(state.date);
			d.setDate(d.getDate() + 1);
			state.date = clampDateToHorizon(d);
			dp.value = ymd(state.date);
			loadAllForDate();
			renderSidebar();
			renderGrid();
		});

		// byId("print-day").addEventListener("click", () => window.print());

		byId("add-patient").addEventListener("click", () => openModal("patientModal"));
		byId("add-staff").addEventListener("click", () => openModal("staffModal"));
		byId("new-event").addEventListener("click", () => openModal("eventModal"));

		function openModal(id) {
			byId(id).classList.remove("hidden");
		}

		function closeModal(id) {
			byId(id).classList.add("hidden");
		}

		byId("patientForm").addEventListener("submit", e => {
			e.preventDefault();
			const name = byId("patientName").value.trim();
			if (!name) return;

			// ✅ Check limit before adding
			if (state.patients.length >= 15) {
				alert("⚠️ Maximum 15 patients allowed per day.");
				return;
			}

			const p = { id: crypto.randomUUID(), name };

			state.patients.push(p);

			const allPatients = loadLS(LS_PATIENTS, {});
			allPatients[ymd(state.date)] = state.patients;
			saveLS(LS_PATIENTS, allPatients);

			closeModal("patientModal");
			byId("patientForm").reset();
			renderSidebar();
			renderGrid();
		});

		byId("staffForm").addEventListener("submit", e => {
			e.preventDefault();
			const name = byId("staffName").value.trim();
			if (!name) return;
			const color = byId("staffColor").value;

			state.staff.push({ id: crypto.randomUUID(), name, color });
			saveLS(LS_STAFF, state.staff);

			closeModal("staffModal");
			byId("staffForm").reset();
			renderSidebar();
		});

		byId("eventForm").addEventListener("submit", e => {
			e.preventDefault();

			const title = byId("eventTitle").value.trim();
			if (!title) return;

			const color = byId("eventColor").value;
			const duration = Math.max(15, Number(byId("eventDuration").value) || 30);
			const description = byId("eventDescription").value.trim();

			const quickData = byId("eventModal").dataset.quickCreate
				? JSON.parse(byId("eventModal").dataset.quickCreate)
				: null;

			const scheduled = quickData
				? {
					id: crypto.randomUUID(),
					title,
					color,
					duration,
					description,
					staff: [],
					date: ymd(state.date),
					patientId: quickData.patientId,
					start: minutesToTime(quickData.startMins),
					end: minutesToTime(quickData.startMins + duration),
				}
				: {
					id: crypto.randomUUID(),
					title,
					color,
					duration,
					description,
					staff: [],
				};

			if (quickData) {
				state.scheduled.push(scheduled);
				saveAll();
				refresh();
			} else {
				// Original event template creation logic
				const tpl = {
					id: crypto.randomUUID(),
					title,
					color,
					duration,
					description,
					staff: []
				};
				state.events.push(tpl);
				saveLS(LS_EVENTS, state.events);
				renderSidebar();
			}

			byId("eventForm").reset();
			byId("eventModal").classList.add("hidden");
			delete byId("eventModal").dataset.quickCreate;
		});


		document.querySelectorAll(".fixed").forEach(modal => {
			modal.addEventListener("click", e => {
				if (e.target === modal) closeModal(modal.id);
			});
		});

		document.querySelectorAll(".fixed button").forEach(btn => {
			if (btn.textContent === "Cancel") {
				btn.addEventListener("click", e => {
					const modal = e.target.closest(".fixed");
					if (modal) modal.classList.add("hidden");
				});
			}
		});

	}

	// ---------- Refresh ----------
	function refresh() {
		loadAllForDate();
		renderSidebar();
		renderGrid();
	}

	// ---------- Edit Event ----------
	let editingEvent = null;

	function openEditorForScheduled(evt) {
		editingEvent = evt;

		const modal = byId("editEventModal");
		byId("editEventTitle").value = evt.title;
		byId("editEventStart").value = evt.start;
		byId("editEventDuration").value = evt.duration;
		byId("editEventColor").value = evt.color;
		byId("editEventDescription").value = evt.description || "";

		modal.classList.remove("hidden");
	}

	// Cancel button
	byId("editEventCancel").addEventListener("click", () => {
		byId("editEventModal").classList.add("hidden");
		editingEvent = null;
	});

	// Form submit
	byId("editEventForm").addEventListener("submit", e => {
		e.preventDefault();
		if (!editingEvent) return;

		editingEvent.title = byId("editEventTitle").value.trim() || editingEvent.title;
		editingEvent.start = byId("editEventStart").value;
		editingEvent.duration = Math.max(15, Number(byId("editEventDuration").value) || editingEvent.duration);
		editingEvent.end = minutesToTime(timeToMinutes(editingEvent.start) + editingEvent.duration);
		editingEvent.color = byId("editEventColor").value;
		editingEvent.description = byId("editEventDescription").value.trim();

		saveAll();
		refresh();

		byId("editEventModal").classList.add("hidden");
		editingEvent = null;
	});


	// Boot
	init();
})();
