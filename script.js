document.addEventListener('DOMContentLoaded', () => {
    // ===== DOM REFS =====
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const taskDateInput = document.getElementById('task-date');
    const taskListEl = document.getElementById('task-list');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const progressText = document.getElementById('progress-text');
    const progressPercentage = document.getElementById('progress-percentage');
    const progressBarFill = document.getElementById('progress-bar-fill');

    let currentFilter = 'all';
    let geminiApiKey = localStorage.getItem('gemini_api_key') || '';

    // ===== TASK STATE =====
    let tasks = JSON.parse(localStorage.getItem('ai_tasks') || '[]');

    // Migrate old flat subtask format to parentId model
    tasks = migrateTasks(tasks);
    saveTasks();

    function migrateTasks(arr) {
        // Find old-style AI subtasks (isSubtask:true but no parentId)
        const parents = arr.filter(t => !t.isSubtask && !t.parentId);
        const orphans = arr.filter(t => t.isSubtask && !t.parentId);
        if (!orphans.length) return arr;

        let parentIndex = 0;
        orphans.forEach(o => {
            if (parentIndex < parents.length) {
                o.parentId = parents[parentIndex].id;
            }
        });
        return arr.map(t => {
            if (t.isSubtask) { delete t.isSubtask; }
            return t;
        });
    }

    function saveTasks() {
        localStorage.setItem('ai_tasks', JSON.stringify(tasks));
    }

    function isSubtask(task) { return !!task.parentId; }
    function isParent(task) { return tasks.some(t => t.parentId === task.id); }

    function getSubtasks(parentId) { return tasks.filter(t => t.parentId === parentId); }

    function checkParentCompletion(parentId) {
        if (!parentId) return;
        const subs = getSubtasks(parentId);
        if (subs.length === 0) return;
        const allDone = subs.every(t => t.completed);
        tasks = tasks.map(t => t.id === parentId ? { ...t, completed: allDone } : t);
        saveTasks();
    }

    // ===== PROGRESS =====
    function updateProgress() {
        if (!progressText) return;
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
        progressText.textContent = `${completed}/${total} completed`;
        progressPercentage.textContent = `${pct}%`;
        progressBarFill.style.width = `${pct}%`;
    }

    // ===== TASK CRUD =====
    function addTask(text, deadline = '', parentId = null) {
        const t = { id: Date.now(), text, completed: false, deadline, parentId };
        tasks.push(t);
        saveTasks();
    }

    function toggleTask(id) {
        tasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
        // If toggling a subtask, check parent
        const task = tasks.find(t => t.id === id);
        if (task && task.parentId) checkParentCompletion(task.parentId);
        // If toggling a parent, cascade to children
        if (tasks.find(t => t.id === id && !t.parentId)) {
            const parent = tasks.find(t => t.id === id);
            tasks = tasks.map(t => t.parentId === id ? { ...t, completed: parent.completed } : t);
        }
        saveTasks();
    }

    function updateTaskText(id, newText) {
        tasks = tasks.map(t => t.id === id ? { ...t, text: newText } : t);
        saveTasks();
    }

    function updateTaskDeadline(id, newDeadline) {
        tasks = tasks.map(t => t.id === id ? { ...t, deadline: newDeadline } : t);
        saveTasks();
    }

    function deleteTask(id) {
        // Delete task and its subtasks
        tasks = tasks.filter(t => t.id !== id && t.parentId !== id);
        saveTasks();
    }

    // ===== RENDER TASK LIST =====
    function renderTasks() {
        taskListEl.innerHTML = '';

        const parents = tasks.filter(t => !t.parentId);
        const filtered = parents.filter(task => {
            if (currentFilter === 'pending') return !task.completed;
            if (currentFilter === 'completed') return task.completed;
            return true;
        });

        if (filtered.length === 0) {
            taskListEl.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:2rem 0;font-size:0.9rem;">No tasks found.</div>`;
            updateProgress();
            return;
        }

        filtered.forEach(task => {
            renderTaskItem(task, taskListEl);
            const subs = getSubtasks(task.id);
            subs.forEach(sub => renderTaskItem(sub, taskListEl));
        });

        updateProgress();
        renderMiniCalendar();
    }

    function renderTaskItem(task, container, opts = {}) {
        const li = document.createElement('li');
        const isParentTask = isParent(task);
        li.className = `task-item ${task.completed ? 'completed' : ''} ${task.parentId ? 'is-subtask' : ''} ${isParentTask ? 'parent-task' : ''}`;
        li.dataset.id = task.id;
        li.draggable = !task.parentId && currentFilter === 'all';

        const today = new Date().toISOString().split('T')[0];
        const isOverdue = task.deadline && task.deadline < today;
        const dateBadge = task.deadline ? `<span class="task-date-badge ${isOverdue ? 'overdue' : ''}">${task.deadline}</span>` : '';

        li.innerHTML = `
            <div class="task-main-row">
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                <input type="text" class="task-text" value="${escapeHTML(task.text)}">
                <div class="task-actions">
                    ${!task.parentId ? `<button class="action-btn btn-add-subtask" title="Add Subtask"><i class="ph ph-plus-circle"></i></button>` : ''}
                    <button class="action-btn btn-delete" title="Delete"><i class="ph ph-trash"></i></button>
                </div>
            </div>
            ${task.deadline || task.parentId !== null ? `<div class="task-meta-row">${dateBadge}</div>` : ''}
        `;

        // Checkbox
        li.querySelector('.task-checkbox').addEventListener('change', () => {
            toggleTask(task.id);
            renderTasks();
            if (currentCalDate) renderCalDayTasks(currentCalDate);
        });

        // Editable text
        const textEl = li.querySelector('.task-text');
        textEl.addEventListener('focus', () => textEl.removeAttribute('readonly'));
        textEl.addEventListener('blur', () => {
            textEl.setAttribute('readonly', true);
            updateTaskText(task.id, textEl.value);
            renderMiniCalendar();
        });
        textEl.addEventListener('keydown', e => { if (e.key === 'Enter') textEl.blur(); });

        // Delete
        li.querySelector('.btn-delete')?.addEventListener('click', () => {
            li.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => { deleteTask(task.id); renderTasks(); if (currentCalDate) renderCalDayTasks(currentCalDate); }, 280);
        });

        // Add subtask button
        li.querySelector('.btn-add-subtask')?.addEventListener('click', () => {
            showSubtaskForm(li, task.id, container);
        });

        // Drag
        li.addEventListener('dragstart', () => li.classList.add('dragging'));
        li.addEventListener('dragend', () => { li.classList.remove('dragging'); updateTaskOrder(); });

        container.appendChild(li);
    }

    function showSubtaskForm(parentLi, parentId, container) {
        // Remove existing form if any
        const existing = parentLi.querySelector('.subtask-add-form');
        if (existing) { existing.remove(); return; }

        const form = document.createElement('div');
        form.className = 'subtask-add-form';
        form.innerHTML = `
            <input type="text" placeholder="Subtask description...">
            <input type="date" title="Subtask deadline">
            <button class="btn-confirm">Add</button>
            <button class="btn-cancel">Cancel</button>
        `;
        parentLi.appendChild(form);

        const inp = form.querySelector('input[type="text"]');
        const dateInp = form.querySelector('input[type="date"]');
        inp.focus();

        form.querySelector('.btn-confirm').addEventListener('click', () => {
            const txt = inp.value.trim();
            if (!txt) return;
            addTask(txt, dateInp.value, parentId);
            renderTasks();
            if (currentCalDate) renderCalDayTasks(currentCalDate);
        });
        form.querySelector('.btn-cancel').addEventListener('click', () => form.remove());
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') form.querySelector('.btn-confirm').click(); });
    }

    // ===== DRAG & DROP =====
    taskListEl.addEventListener('dragover', e => {
        e.preventDefault();
        if (currentFilter !== 'all') return;
        const afterEl = getDragAfterElement(taskListEl, e.clientY);
        const dragging = document.querySelector('.dragging');
        if (!dragging) return;
        if (!afterEl) taskListEl.appendChild(dragging);
        else taskListEl.insertBefore(dragging, afterEl);
    });

    function getDragAfterElement(container, y) {
        return [...container.querySelectorAll('.task-item:not(.dragging)')].reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function updateTaskOrder() {
        if (currentFilter !== 'all') return;
        const ids = [...taskListEl.querySelectorAll('.task-item')].map(el => Number(el.dataset.id));
        const reordered = [];
        ids.forEach(id => { const t = tasks.find(t => t.id === id); if (t) reordered.push(t); });
        tasks = reordered;
        saveTasks();
    }

    // ===== FILTERS =====
    filterBtns.forEach(btn => btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderTasks();
    }));

    // ===== FORM SUBMIT =====
    taskForm.addEventListener('submit', e => {
        e.preventDefault();
        const text = taskInput.value.trim();
        const date = taskDateInput ? taskDateInput.value : '';
        if (text) {
            addTask(text, date);
            taskInput.value = '';
            if (taskDateInput) taskDateInput.value = '';
            renderTasks();
        }
    });

    // ===== AI BREAKDOWN =====
    const btnAi = document.getElementById('btn-ai');
    const inputWrapper = document.querySelector('.input-wrapper');

    btnAi.addEventListener('click', async () => {
        const text = taskInput.value.trim();
        if (!text) return;
        if (!geminiApiKey) {
            alert("Please add your Gemini API Key in Settings first!");
            document.getElementById('settings-modal').classList.remove('hidden');
            return;
        }
        inputWrapper.classList.add('ai-thinking');
        taskInput.disabled = true; btnAi.disabled = true;
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: `Break down the following task into 3 to 5 very short, actionable subtasks. Return ONLY a valid JSON array of strings. No markdown, no backticks, no other text. Task: "${text}"` }] }] })
            });
            if (!res.ok) throw new Error('API Error');
            const data = await res.json();
            const raw = data.candidates[0].content.parts[0].text;
            const subtasks = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
            const parentId = Date.now();
            const date = taskDateInput ? taskDateInput.value : '';
            addTask(text + ' (AI Planned)', date);
            // Use the actual parentId from newly pushed task
            const parent = tasks[tasks.length - 1];
            subtasks.forEach(sub => addTask(sub, '', parent.id));
        } catch (err) {
            console.error(err);
            alert("Failed to generate subtasks. Please check your API key.");
        }
        saveTasks();
        renderTasks();
        taskInput.value = '';
        if (taskDateInput) taskDateInput.value = '';
        taskInput.disabled = false; btnAi.disabled = false;
        inputWrapper.classList.remove('ai-thinking');
        taskInput.focus();
    });

    // ===== POMODORO =====
    const pomodoroWidget = document.querySelector('.pomodoro-widget');
    const pomodoroTimeEl = document.getElementById('pomodoro-time');
    const btnPomodoro = document.getElementById('btn-pomodoro');
    let pomInt, pomSecs = 25 * 60, pomRunning = false;

    function updatePomDisplay() {
        const m = Math.floor(pomSecs / 60).toString().padStart(2, '0');
        const s = (pomSecs % 60).toString().padStart(2, '0');
        if (pomodoroTimeEl) pomodoroTimeEl.textContent = `${m}:${s}`;
    }

    if (btnPomodoro) {
        btnPomodoro.addEventListener('click', () => {
            const icon = btnPomodoro.querySelector('i');
            if (pomRunning) {
                clearInterval(pomInt); pomRunning = false;
                icon.className = 'ph ph-play'; pomodoroWidget.classList.remove('running');
            } else {
                pomRunning = true; icon.className = 'ph ph-pause';
                pomodoroWidget.classList.add('running');
                pomInt = setInterval(() => {
                    pomSecs--;
                    if (pomSecs < 0) {
                        clearInterval(pomInt); pomSecs = 25 * 60; pomRunning = false;
                        icon.className = 'ph ph-play'; pomodoroWidget.classList.remove('running');
                        alert('Pomodoro complete! Take a break. 🎉');
                    }
                    updatePomDisplay();
                }, 1000);
            }
        });
        updatePomDisplay();
    }

    // ===== SETTINGS =====
    const settingsModal = document.getElementById('settings-modal');
    const btnSettings = document.getElementById('btn-settings');
    const apiKeyInput = document.getElementById('api-key-input');
    document.getElementById('btn-settings')?.addEventListener('click', () => { apiKeyInput.value = geminiApiKey; settingsModal.classList.remove('hidden'); });
    document.getElementById('btn-close-settings')?.addEventListener('click', () => settingsModal.classList.add('hidden'));
    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
        geminiApiKey = apiKeyInput.value.trim();
        localStorage.setItem('gemini_api_key', geminiApiKey);
        settingsModal.classList.add('hidden');
    });

    // ===== MINI CALENDAR =====
    let miniCalYear, miniCalMonth;

    function initMiniCal() {
        const now = new Date();
        miniCalYear = now.getFullYear();
        miniCalMonth = now.getMonth();
        renderMiniCalendar();
    }

    document.getElementById('cal-prev').addEventListener('click', () => {
        miniCalMonth--; if (miniCalMonth < 0) { miniCalMonth = 11; miniCalYear--; }
        renderMiniCalendar();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
        miniCalMonth++; if (miniCalMonth > 11) { miniCalMonth = 0; miniCalYear++; }
        renderMiniCalendar();
    });

    function renderMiniCalendar() {
        const label = document.getElementById('cal-month-label');
        const grid = document.getElementById('mini-cal-grid');
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        label.textContent = `${monthNames[miniCalMonth]} ${miniCalYear}`;
        grid.innerHTML = '';

        const firstDay = new Date(miniCalYear, miniCalMonth, 1).getDay();
        const daysInMonth = new Date(miniCalYear, miniCalMonth + 1, 0).getDate();
        const prevDays = new Date(miniCalYear, miniCalMonth, 0).getDate();
        const today = new Date().toISOString().split('T')[0];

        // Prev month filler
        for (let i = firstDay - 1; i >= 0; i--) {
            const cell = document.createElement('div');
            cell.className = 'cal-day other-month';
            cell.textContent = prevDays - i;
            grid.appendChild(cell);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${miniCalYear}-${String(miniCalMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayTasks = getTasksForDate(dateStr);
            const cell = document.createElement('div');
            const isToday = dateStr === today;
            cell.className = `cal-day ${isToday ? 'today' : ''} ${dayTasks.length ? 'has-tasks' : ''}`;
            cell.innerHTML = `<span>${d}</span>${dayTasks.length ? `<div class="task-dots">${dayTasks.slice(0,3).map(t => `<div class="task-dot ${t.completed ? 'completed' : ''}"></div>`).join('')}</div>` : ''}`;
            cell.addEventListener('click', () => openCalendarFullscreen(dateStr));
            grid.appendChild(cell);
        }

        // Next month filler
        const totalCells = firstDay + daysInMonth;
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let i = 1; i <= remaining; i++) {
            const cell = document.createElement('div');
            cell.className = 'cal-day other-month';
            cell.textContent = i;
            grid.appendChild(cell);
        }
    }

    function getTasksForDate(dateStr) {
        return tasks.filter(t => t.deadline === dateStr);
    }

    // ===== FULL-SCREEN CALENDAR =====
    const calFs = document.getElementById('calendar-fullscreen');
    let calFsYear, calFsMonth;
    let currentCalDate = null;

    function openCalendarFullscreen(dateStr) {
        calFs.classList.remove('hidden');
        setTimeout(() => calFs.classList.add('active'), 10);

        if (dateStr) {
            const d = new Date(dateStr + 'T12:00:00');
            calFsYear = d.getFullYear(); calFsMonth = d.getMonth();
        } else {
            const now = new Date(); calFsYear = now.getFullYear(); calFsMonth = now.getMonth();
        }
        renderFsCalendar();
        if (dateStr) { currentCalDate = dateStr; renderCalDayTasks(dateStr); highlightFsDay(dateStr); }
    }

    document.getElementById('btn-cal-back').addEventListener('click', () => {
        calFs.classList.remove('active');
        setTimeout(() => calFs.classList.add('hidden'), 450);
        currentCalDate = null;
    });

    document.getElementById('cal-fs-prev').addEventListener('click', () => {
        calFsMonth--; if (calFsMonth < 0) { calFsMonth = 11; calFsYear--; }
        renderFsCalendar();
    });
    document.getElementById('cal-fs-next').addEventListener('click', () => {
        calFsMonth++; if (calFsMonth > 11) { calFsMonth = 0; calFsYear++; }
        renderFsCalendar();
    });

    function renderFsCalendar() {
        const label = document.getElementById('cal-fs-month-label');
        const grid = document.getElementById('cal-fs-grid');
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        label.textContent = `${monthNames[calFsMonth]} ${calFsYear}`;
        grid.innerHTML = '';

        const firstDay = new Date(calFsYear, calFsMonth, 1).getDay();
        const daysInMonth = new Date(calFsYear, calFsMonth + 1, 0).getDate();
        const today = new Date().toISOString().split('T')[0];

        for (let i = 0; i < firstDay; i++) {
            const cell = document.createElement('div');
            cell.className = 'cal-fs-day other-month';
            grid.appendChild(cell);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${calFsYear}-${String(calFsMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayTasks = getTasksForDate(dateStr);
            const cell = document.createElement('div');
            cell.className = `cal-fs-day ${dateStr === today ? 'today' : ''} ${dateStr === currentCalDate ? 'selected' : ''}`;
            cell.dataset.date = dateStr;
            cell.innerHTML = `<span class="cal-fs-day-num">${d}</span>${dayTasks.slice(0, 2).map(t => `<div class="cal-fs-task-chip ${t.completed ? 'completed' : ''}">${escapeHTML(t.text)}</div>`).join('')}`;
            cell.addEventListener('click', () => {
                currentCalDate = dateStr;
                document.querySelectorAll('.cal-fs-day').forEach(c => c.classList.remove('selected'));
                cell.classList.add('selected');
                renderCalDayTasks(dateStr);
            });
            grid.appendChild(cell);
        }
    }

    function highlightFsDay(dateStr) {
        document.querySelectorAll('.cal-fs-day').forEach(c => {
            c.classList.toggle('selected', c.dataset.date === dateStr);
        });
    }

    function renderCalDayTasks(dateStr) {
        const panel = document.getElementById('cal-day-tasks');
        const title = document.getElementById('cal-day-title');
        const d = new Date(dateStr + 'T12:00:00');
        title.textContent = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        panel.innerHTML = '';

        const dayTasks = getTasksForDate(dateStr);
        if (dayTasks.length === 0) {
            panel.innerHTML = `<p class="cal-empty-hint">No tasks for this date.<br>Add a task in the main panel with this date!</p>`;
            return;
        }

        dayTasks.forEach(task => {
            const subs = getSubtasks(task.id);
            renderCalTaskItem(task, panel, dateStr);
            subs.forEach(sub => renderCalTaskItem(sub, panel, dateStr));
        });

        // Add subtask button at bottom
        const addSubBtn = document.createElement('div');
        addSubBtn.innerHTML = `<button id="cal-add-task-btn" style="margin-top:0.5rem;background:transparent;border:1px dashed var(--glass-border);color:var(--text-secondary);width:100%;padding:0.6rem;border-radius:12px;cursor:pointer;font-family:Inter,sans-serif;font-size:0.85rem;transition:all 0.2s;">+ Add task for this date</button>`;
        panel.appendChild(addSubBtn);
        addSubBtn.querySelector('button').addEventListener('click', () => showCalAddForm(panel, dateStr));
    }

    function renderCalTaskItem(task, container, selectedDate) {
        const div = document.createElement('div');
        div.className = `cal-task-item ${task.parentId ? 'is-subtask' : ''}`;
        div.dataset.id = task.id;

        const today = new Date().toISOString().split('T')[0];
        const isOverdue = task.deadline && task.deadline < today;
        const dateBadge = task.deadline ? `<span class="task-date-badge ${isOverdue ? 'overdue' : ''}">${task.deadline}</span>` : '';

        div.innerHTML = `
            <div class="cal-task-row">
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                <input type="text" class="task-text" value="${escapeHTML(task.text)}">
                <div class="cal-task-actions">
                    ${!task.parentId ? `<button class="cal-action-btn btn-add-subtask" title="Add Subtask"><i class="ph ph-plus-circle"></i></button>` : ''}
                    <button class="cal-action-btn btn-delete" title="Delete"><i class="ph ph-trash"></i></button>
                </div>
            </div>
            ${task.deadline ? `<div style="padding-left:2.2rem;">${dateBadge}</div>` : ''}
        `;

        div.querySelector('.task-checkbox').addEventListener('change', () => {
            toggleTask(task.id); renderTasks(); renderCalDayTasks(selectedDate); renderFsCalendar();
        });

        const textEl = div.querySelector('.task-text');
        textEl.addEventListener('focus', () => textEl.removeAttribute('readonly'));
        textEl.addEventListener('blur', () => { textEl.setAttribute('readonly', true); updateTaskText(task.id, textEl.value); renderTasks(); });
        textEl.addEventListener('keydown', e => { if (e.key === 'Enter') textEl.blur(); });

        div.querySelector('.btn-delete')?.addEventListener('click', () => {
            deleteTask(task.id); renderTasks(); renderCalDayTasks(selectedDate); renderFsCalendar();
        });

        div.querySelector('.btn-add-subtask')?.addEventListener('click', () => {
            showCalSubtaskForm(div, task.id, selectedDate);
        });

        container.appendChild(div);
    }

    function showCalSubtaskForm(parentDiv, parentId, selectedDate) {
        const existing = parentDiv.querySelector('.subtask-add-form');
        if (existing) { existing.remove(); return; }

        const form = document.createElement('div');
        form.className = 'subtask-add-form';
        form.innerHTML = `<input type="text" placeholder="Subtask description..."><input type="date" title="Subtask deadline"><button class="btn-confirm">Add</button><button class="btn-cancel">Cancel</button>`;
        parentDiv.appendChild(form);
        const inp = form.querySelector('input[type="text"]');
        const dateInp = form.querySelector('input[type="date"]');
        inp.focus();
        form.querySelector('.btn-confirm').addEventListener('click', () => {
            const txt = inp.value.trim();
            if (!txt) return;
            addTask(txt, dateInp.value, parentId);
            renderTasks(); renderCalDayTasks(selectedDate); renderFsCalendar();
        });
        form.querySelector('.btn-cancel').addEventListener('click', () => form.remove());
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') form.querySelector('.btn-confirm').click(); });
    }

    function showCalAddForm(panel, dateStr) {
        const existing = document.getElementById('cal-inline-add');
        if (existing) { existing.remove(); return; }

        const form = document.createElement('div');
        form.id = 'cal-inline-add';
        form.className = 'subtask-add-form';
        form.style.cssText = 'margin-top:0.5rem;padding-left:0;';
        form.innerHTML = `<input type="text" placeholder="New task for this date..."><input type="date" value="${dateStr}"><button class="btn-confirm">Add</button><button class="btn-cancel">Cancel</button>`;
        panel.appendChild(form);
        const inp = form.querySelector('input[type="text"]');
        const dateInp = form.querySelector('input[type="date"]');
        inp.focus();
        form.querySelector('.btn-confirm').addEventListener('click', () => {
            const txt = inp.value.trim();
            if (!txt) return;
            addTask(txt, dateInp.value);
            renderTasks(); renderCalDayTasks(dateStr); renderFsCalendar();
        });
        form.querySelector('.btn-cancel').addEventListener('click', () => form.remove());
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') form.querySelector('.btn-confirm').click(); });
    }

    // ===== UTIL =====
    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[tag] || tag));
    }

    // ===== INIT =====
    renderTasks();
    initMiniCal();
});
