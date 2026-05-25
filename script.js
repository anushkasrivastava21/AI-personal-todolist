document.addEventListener('DOMContentLoaded', () => {
    // ===== DOM REFS =====
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const taskListEl = document.getElementById('task-list');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const progressText = document.getElementById('progress-text');
    const progressPercentage = document.getElementById('progress-percentage');
    const progressBarFill = document.getElementById('progress-bar-fill');

    let currentFilter = 'all';
    let geminiApiKey = localStorage.getItem('gemini_api_key') || '';

    // ===================================================================
    //  SECTION 1: NAVIGATION
    // ===================================================================
    const navTabs = document.querySelectorAll('.nav-tab[data-screen]');
    const screens = document.querySelectorAll('.screen');

    navTabs.forEach(tab => tab.addEventListener('click', () => {
        const target = tab.dataset.screen;
        navTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        screens.forEach(s => s.classList.toggle('active', s.id === `screen-${target}`));
        if (target === 'pomodoro') populatePomodoroTaskSelect();
        if (target === 'habits') renderHabits();
    }));

    // ===================================================================
    //  SECTION 2: TASK STATE & CRUD
    // ===================================================================
    let tasks = JSON.parse(localStorage.getItem('ai_tasks') || '[]');
    tasks = migrateTasks(tasks);
    saveTasks();

    function migrateTasks(arr) {
        return arr.map(t => {
            if (t.isSubtask) delete t.isSubtask;
            if (t.points === undefined) t.points = 10;
            if (t.workload === undefined) t.workload = 5;
            if (t.tags === undefined) t.tags = [];
            if (t.estimatedMinutes === undefined) t.estimatedMinutes = null;
            return t;
        });
    }

    function saveTasks() { localStorage.setItem('ai_tasks', JSON.stringify(tasks)); }
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

    function addTask(text, deadline = '', parentId = null, extraFields = {}) {
        const t = {
            id: Date.now() + Math.random(),
            text, completed: false, deadline, parentId,
            points: extraFields.points || 10,
            workload: extraFields.workload || 5,
            tags: extraFields.tags || [],
            estimatedMinutes: extraFields.estimatedMinutes || null,
        };
        tasks.push(t);
        saveTasks();
        return t;
    }

    function toggleTask(id) {
        tasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
        const task = tasks.find(t => t.id === id);
        if (task && task.parentId) checkParentCompletion(task.parentId);
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

    function deleteTask(id) {
        tasks = tasks.filter(t => t.id !== id && t.parentId !== id);
        saveTasks();
    }

    // ===== WORKLOAD-BASED PROGRESS =====
    function updateProgress() {
        if (!progressText) return;
        const allTasks = [...tasks];
        const dailyForToday = getDailyTasksForToday();
        const recurringForToday = typeof getRecurringTasksForToday === 'function' ? getRecurringTasksForToday() : [];
        const totalWorkload = allTasks.reduce((s, t) => s + (t.workload || 5), 0)
            + dailyForToday.reduce((s, dt) => s + (dt.workload || 3), 0)
            + recurringForToday.reduce((s, rt) => s + (rt.workload || 3), 0);
        const completedWorkload = allTasks.filter(t => t.completed).reduce((s, t) => s + (t.workload || 5), 0)
            + dailyForToday.filter(dt => isDailyDoneToday(dt)).reduce((s, dt) => s + (dt.workload || 3), 0)
            + recurringForToday.filter(rt => typeof isRecurringDoneToday === 'function' && isRecurringDoneToday(rt)).reduce((s, rt) => s + (rt.workload || 3), 0);
        const pct = totalWorkload === 0 ? 0 : Math.round((completedWorkload / totalWorkload) * 100);
        progressText.textContent = `${completedWorkload}/${totalWorkload} workload`;
        progressPercentage.textContent = `${pct}%`;
        progressBarFill.style.width = `${pct}%`;
    }

    // ===================================================================
    //  SECTION 3: ENHANCED TASK FORM
    // ===================================================================
    const btnExpand = document.getElementById('btn-expand-form');
    const formExpanded = document.getElementById('form-expanded');
    const taskDailyToggle = document.getElementById('task-daily-toggle');
    const dailyTimeOptions = document.getElementById('daily-time-options');
    let selectedEstTime = null;
    let selectedTod = null;

    btnExpand.addEventListener('click', () => {
        formExpanded.classList.toggle('hidden');
        btnExpand.querySelector('i').className = formExpanded.classList.contains('hidden')
            ? 'ph ph-sliders-horizontal' : 'ph ph-x';
    });

    // Time chips
    document.querySelectorAll('.time-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            selectedEstTime = parseInt(chip.dataset.mins);
        });
    });

    // Daily toggle
    taskDailyToggle.addEventListener('change', () => {
        dailyTimeOptions.classList.toggle('hidden', !taskDailyToggle.checked);
    });

    // Time-of-day chips
    document.querySelectorAll('.tod-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.tod-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            selectedTod = chip.dataset.tod;
        });
    });

    // Form Submit
    taskForm.addEventListener('submit', e => {
        e.preventDefault();
        const text = taskInput.value.trim();
        if (!text) return;

        if (taskDailyToggle.checked) {
            // Create daily task instead
            addDailyTask(text, {
                timeOfDay: selectedTod || null,
                points: parseInt(document.getElementById('task-points').value) || 10,
                workload: parseInt(document.getElementById('task-workload').value) || 3,
            });
        } else {
            const deadline = document.getElementById('task-date').value || '';
            const tags = document.getElementById('task-tags').value.trim()
                ? document.getElementById('task-tags').value.split(',').map(t => t.trim()).filter(Boolean)
                : [];
            addTask(text, deadline, null, {
                points: parseInt(document.getElementById('task-points').value) || 10,
                workload: parseInt(document.getElementById('task-workload').value) || 5,
                tags,
                estimatedMinutes: selectedEstTime || (parseInt(document.getElementById('task-est-time').value) || null),
            });
        }

        // Reset form
        taskInput.value = '';
        document.getElementById('task-date').value = '';
        document.getElementById('task-tags').value = '';
        document.getElementById('task-points').value = '10';
        document.getElementById('task-workload').value = '5';
        document.getElementById('task-est-time').value = '';
        document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tod-chip').forEach(c => c.classList.remove('active'));
        selectedEstTime = null;
        selectedTod = null;
        taskDailyToggle.checked = false;
        dailyTimeOptions.classList.add('hidden');
        renderTasks();
        renderDailyTasks();
    });

    // ===================================================================
    //  SECTION 4: RENDER TASK LIST
    // ===================================================================
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
        } else {
            filtered.forEach(task => {
                renderTaskItem(task, taskListEl);
                getSubtasks(task.id).forEach(sub => renderTaskItem(sub, taskListEl));
            });
        }

        updateProgress();
        renderMiniCalendar();
        renderDailyTasks();
        if (typeof renderRecurringTasks === 'function') renderRecurringTasks();
        renderHabitsInTaskList();
    }

    function renderTaskItem(task, container) {
        const li = document.createElement('li');
        const isParentTask = isParent(task);
        li.className = `task-item ${task.completed ? 'completed' : ''} ${task.parentId ? 'is-subtask' : ''} ${isParentTask ? 'parent-task' : ''}`;
        li.dataset.id = task.id;
        li.draggable = !task.parentId && currentFilter === 'all';

        const today = new Date().toISOString().split('T')[0];
        const isOverdue = task.deadline && task.deadline < today;

        let metaBadges = '';
        if (task.deadline) metaBadges += `<span class="task-date-badge ${isOverdue ? 'overdue' : ''}">${task.deadline}</span>`;
        if (task.points && task.points !== 10) metaBadges += `<span class="task-points-badge">★ ${task.points} pts</span>`;
        if (task.workload) metaBadges += `<span class="task-workload-badge">⚡ ${task.workload}</span>`;
        if (task.estimatedMinutes) metaBadges += `<span class="task-time-badge">⏱ ${task.estimatedMinutes}m</span>`;
        if (task.tags && task.tags.length) metaBadges += task.tags.map(t => `<span class="task-tag">${escapeHTML(t)}</span>`).join('');

        li.innerHTML = `
            <div class="task-main-row">
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                <input type="text" class="task-text" value="${escapeHTML(task.text)}" readonly>
                <div class="task-actions">
                    ${!task.parentId ? `<button class="action-btn btn-add-subtask" title="Add Subtask"><i class="ph ph-plus-circle"></i></button>` : ''}
                    <button class="action-btn btn-edit-task" title="Edit Task"><i class="ph ph-pencil"></i></button>
                    <button class="action-btn btn-delete" title="Delete"><i class="ph ph-trash"></i></button>
                </div>
            </div>
            ${metaBadges ? `<div class="task-meta-row">${metaBadges}</div>` : ''}
        `;

        li.querySelector('.task-checkbox').addEventListener('change', () => {
            toggleTask(task.id); renderTasks();
            if (currentCalDate) renderCalDayTasks(currentCalDate);
        });

        const textEl = li.querySelector('.task-text');
        textEl.addEventListener('focus', () => textEl.removeAttribute('readonly'));
        textEl.addEventListener('blur', () => {
            textEl.setAttribute('readonly', true);
            updateTaskText(task.id, textEl.value);
            renderMiniCalendar();
        });
        textEl.addEventListener('keydown', e => { if (e.key === 'Enter') textEl.blur(); });

        li.querySelector('.btn-delete')?.addEventListener('click', () => {
            li.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => { deleteTask(task.id); renderTasks(); if (currentCalDate) renderCalDayTasks(currentCalDate); }, 280);
        });

        li.querySelector('.btn-edit-task')?.addEventListener('click', () => {
            openEditTaskModal(task.id);
        });

        li.querySelector('.btn-add-subtask')?.addEventListener('click', () => {
            showSubtaskForm(li, task.id, container);
        });

        li.addEventListener('dragstart', () => li.classList.add('dragging'));
        li.addEventListener('dragend', () => { li.classList.remove('dragging'); updateTaskOrder(); });

        container.appendChild(li);
    }

    function showSubtaskForm(parentLi, parentId) {
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

    // ===== EDIT TASK MODAL LOGIC =====
    let editingTaskId = null;
    const taskEditModal = document.getElementById('task-edit-modal');
    
    document.getElementById('btn-close-task-edit')?.addEventListener('click', () => {
        taskEditModal.classList.add('hidden');
        editingTaskId = null;
    });

    document.getElementById('btn-save-task-edit')?.addEventListener('click', () => {
        if (!editingTaskId) return;
        const task = tasks.find(t => t.id === editingTaskId);
        if (!task) return;
        
        task.text = document.getElementById('edit-task-text').value.trim() || task.text;
        task.points = parseInt(document.getElementById('edit-task-points').value) || 10;
        task.workload = parseInt(document.getElementById('edit-task-workload').value) || 5;
        const tagsRaw = document.getElementById('edit-task-tags').value.trim();
        task.tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
        task.estimatedMinutes = parseInt(document.getElementById('edit-task-est-time').value) || null;
        task.deadline = document.getElementById('edit-task-date').value || '';

        saveTasks();
        taskEditModal.classList.add('hidden');
        editingTaskId = null;
        renderTasks();
        if (currentCalDate) renderCalDayTasks(currentCalDate);
    });

    function openEditTaskModal(id) {
        editingTaskId = id;
        const task = tasks.find(t => t.id === id);
        if (!task) return;
        document.getElementById('edit-task-text').value = task.text;
        document.getElementById('edit-task-points').value = task.points || 10;
        document.getElementById('edit-task-workload').value = task.workload || 5;
        document.getElementById('edit-task-tags').value = task.tags ? task.tags.join(', ') : '';
        document.getElementById('edit-task-est-time').value = task.estimatedMinutes || '';
        document.getElementById('edit-task-date').value = task.deadline || '';
        taskEditModal.classList.remove('hidden');
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

    // ===================================================================
    //  SECTION 5: DAILY RECURRING TASKS
    // ===================================================================
    let dailyTasks = JSON.parse(localStorage.getItem('daily_tasks') || '[]');
    function saveDailyTasks() { localStorage.setItem('daily_tasks', JSON.stringify(dailyTasks)); }

    function todayStr() { return new Date().toISOString().split('T')[0]; }

    function isDailyDoneToday(dt) { return dt.completions && dt.completions[todayStr()] === true; }

    function getDailyTasksForToday() { return dailyTasks; }

    function addDailyTask(name, opts = {}) {
        dailyTasks.push({
            id: Date.now() + Math.random(),
            name,
            timeOfDay: opts.timeOfDay || null,
            points: opts.points || 10,
            workload: opts.workload || 3,
            streakEnabled: true,
            currentStreak: 0,
            bestStreak: 0,
            completions: {},
            createdAt: todayStr(),
        });
        saveDailyTasks();
    }

    function toggleDailyTask(id) {
        const dt = dailyTasks.find(d => d.id === id);
        if (!dt) return;
        if (!dt.completions) dt.completions = {};
        const today = todayStr();
        dt.completions[today] = !dt.completions[today];
        recalcDailyStreak(dt);
        saveDailyTasks();
    }

    function recalcDailyStreak(dt) {
        if (!dt.streakEnabled) { dt.currentStreak = 0; return; }
        let streak = 0;
        const d = new Date();
        // Check today first
        const todayKey = todayStr();
        if (dt.completions[todayKey]) {
            streak = 1;
            d.setDate(d.getDate() - 1);
        }
        // Count backwards
        for (let i = 0; i < 365; i++) {
            const key = d.toISOString().split('T')[0];
            if (dt.completions[key]) {
                if (streak === 0 && i === 0) streak = 0; // started counting
                streak++;
                d.setDate(d.getDate() - 1);
            } else {
                break;
            }
        }
        dt.currentStreak = streak;
        if (streak > dt.bestStreak) dt.bestStreak = streak;
    }

    function deleteDailyTask(id) {
        dailyTasks = dailyTasks.filter(d => d.id !== id);
        saveDailyTasks();
    }

    function renderDailyTasks() {
        const section = document.getElementById('daily-tasks-section');
        if (dailyTasks.length === 0) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');

        const groups = {
            morning: dailyTasks.filter(d => d.timeOfDay === 'morning'),
            afternoon: dailyTasks.filter(d => d.timeOfDay === 'afternoon'),
            evening: dailyTasks.filter(d => d.timeOfDay === 'evening'),
            anytime: dailyTasks.filter(d => !d.timeOfDay || d.timeOfDay === 'anytime'),
        };

        for (const [tod, items] of Object.entries(groups)) {
            const groupEl = document.getElementById(`daily-${tod}`);
            const listEl = groupEl.querySelector('.daily-list');
            listEl.innerHTML = '';
            if (items.length === 0) {
                groupEl.classList.add('hidden');
                continue;
            }
            groupEl.classList.remove('hidden');
            items.forEach(dt => {
                const done = isDailyDoneToday(dt);
                const li = document.createElement('li');
                li.className = `task-item ${done ? 'completed' : ''}`;
                li.dataset.id = dt.id;

                let streakBadge = '';
                if (dt.streakEnabled && dt.currentStreak > 0) {
                    streakBadge = `<span class="streak-badge">🔥 ${dt.currentStreak}d</span>`;
                }

                li.innerHTML = `
                    <div class="task-main-row">
                        <input type="checkbox" class="task-checkbox" ${done ? 'checked' : ''}>
                        <input type="text" class="task-text" value="${escapeHTML(dt.name)}" readonly>
                        <div class="task-actions">
                            <button class="action-btn streak-toggle-btn ${dt.streakEnabled ? 'enabled' : ''}" title="${dt.streakEnabled ? 'Disable streak' : 'Enable streak'}">
                                <i class="ph ph-fire"></i>
                            </button>
                            <button class="action-btn btn-delete" title="Delete"><i class="ph ph-trash"></i></button>
                        </div>
                    </div>
                    ${streakBadge || dt.workload ? `<div class="task-meta-row">${streakBadge}<span class="task-workload-badge">⚡ ${dt.workload || 3}</span><span class="task-points-badge">★ ${dt.points || 10} pts</span></div>` : ''}
                `;

                li.querySelector('.task-checkbox').addEventListener('change', () => {
                    toggleDailyTask(dt.id);
                    renderTasks();
                });

                const textEl = li.querySelector('.task-text');
                textEl.addEventListener('focus', () => textEl.removeAttribute('readonly'));
                textEl.addEventListener('blur', () => {
                    textEl.setAttribute('readonly', true);
                    dt.name = textEl.value;
                    saveDailyTasks();
                });
                textEl.addEventListener('keydown', e => { if (e.key === 'Enter') textEl.blur(); });

                li.querySelector('.streak-toggle-btn').addEventListener('click', () => {
                    dt.streakEnabled = !dt.streakEnabled;
                    recalcDailyStreak(dt);
                    saveDailyTasks();
                    renderDailyTasks();
                    updateProgress();
                });

                li.querySelector('.btn-delete')?.addEventListener('click', () => {
                    li.style.animation = 'fadeOut 0.3s ease forwards';
                    setTimeout(() => { deleteDailyTask(dt.id); renderTasks(); }, 280);
                });

                listEl.appendChild(li);
            });
        }
        updateProgress();
    }

    // ===================================================================
    //  SECTION 5B: RECURRING/SCHEDULED TASKS
    // ===================================================================
    let recurringTasks = JSON.parse(localStorage.getItem('recurring_tasks') || '[]');
    function saveRecurringTasks() { localStorage.setItem('recurring_tasks', JSON.stringify(recurringTasks)); }

    const DAYS_MAP = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function addRecurringTask(name, opts = {}) {
        recurringTasks.push({
            id: Date.now() + Math.random(),
            name,
            recurrenceDays: opts.recurrenceDays || [],   // [0..6]
            timeOfDay: opts.timeOfDay || 'anytime',
            completions: {},   // keyed by date string
            createdAt: todayStr(),
        });
        saveRecurringTasks();
        renderRecurringTasks();
    }

    function getRecurringTasksForToday() {
        const dayNum = new Date().getDay(); // 0=Sun
        return recurringTasks.filter(rt => {
            if (!rt.recurrenceDays || rt.recurrenceDays.length === 0) return true; // no day filter = every day
            return rt.recurrenceDays.includes(dayNum);
        });
    }

    function isRecurringDoneToday(rt) {
        return rt.completions && rt.completions[todayStr()] === true;
    }

    function toggleRecurringTask(id) {
        const rt = recurringTasks.find(r => r.id === id);
        if (!rt) return;
        if (!rt.completions) rt.completions = {};
        const today = todayStr();
        rt.completions[today] = !rt.completions[today];
        saveRecurringTasks();
    }

    function deleteRecurringTask(id) {
        recurringTasks = recurringTasks.filter(r => r.id !== id);
        saveRecurringTasks();
    }

    function renderRecurringTasks() {
        const section = document.getElementById('recurring-tasks-section');
        const listEl = document.getElementById('recurring-task-list');
        if (!section || !listEl) return;

        const todaysTasks = getRecurringTasksForToday();
        // Also show tasks not scheduled today but exist, in a muted style
        const otherTasks = recurringTasks.filter(rt => !todaysTasks.includes(rt));

        if (recurringTasks.length === 0) {
            section.classList.add('hidden');
            return;
        }
        section.classList.remove('hidden');
        listEl.innerHTML = '';

        const todayDayNum = new Date().getDay();

        // Render today's recurring tasks first
        todaysTasks.forEach(rt => {
            const done = isRecurringDoneToday(rt);
            const li = document.createElement('li');
            li.className = `task-item ${done ? 'completed' : ''}`;
            li.dataset.id = rt.id;

            const dayTags = (rt.recurrenceDays || []).map(d =>
                `<span class="recurring-day-tag ${d === todayDayNum ? 'today' : ''}">${DAYS_MAP[d]}</span>`
            ).join('');

            const timeIcon = rt.timeOfDay === 'morning' ? '🌅' : rt.timeOfDay === 'afternoon' ? '☀️' : rt.timeOfDay === 'evening' ? '🌙' : '📋';

            li.innerHTML = `
                <div class="task-main-row">
                    <input type="checkbox" class="task-checkbox" ${done ? 'checked' : ''}>
                    <input type="text" class="task-text" value="${escapeHTML(rt.name)}" readonly>
                    <div class="task-actions">
                        <button class="action-btn btn-delete" title="Delete"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
                <div class="task-meta-row">
                    <span class="recurring-schedule-badge"><i class="ph ph-arrows-clockwise"></i> Recurring</span>
                    <div class="recurring-day-tags">${dayTags}</div>
                    <span class="recurring-time-badge"><i class="ph ph-clock"></i> ${rt.timeOfDay || 'anytime'}</span>
                </div>
            `;

            li.querySelector('.task-checkbox').addEventListener('change', () => {
                toggleRecurringTask(rt.id);
                renderTasks();
            });

            const textEl = li.querySelector('.task-text');
            textEl.addEventListener('focus', () => textEl.removeAttribute('readonly'));
            textEl.addEventListener('blur', () => {
                textEl.setAttribute('readonly', true);
                rt.name = textEl.value;
                saveRecurringTasks();
            });
            textEl.addEventListener('keydown', e => { if (e.key === 'Enter') textEl.blur(); });

            li.querySelector('.btn-delete')?.addEventListener('click', () => {
                li.style.animation = 'fadeOut 0.3s ease forwards';
                setTimeout(() => { deleteRecurringTask(rt.id); renderTasks(); }, 280);
            });

            listEl.appendChild(li);
        });

        // Show non-today tasks in muted style
        otherTasks.forEach(rt => {
            const li = document.createElement('li');
            li.className = 'task-item';
            li.style.opacity = '0.45';
            li.dataset.id = rt.id;

            const dayTags = (rt.recurrenceDays || []).map(d =>
                `<span class="recurring-day-tag">${DAYS_MAP[d]}</span>`
            ).join('');

            li.innerHTML = `
                <div class="task-main-row">
                    <input type="checkbox" class="task-checkbox" disabled>
                    <input type="text" class="task-text" value="${escapeHTML(rt.name)}" readonly>
                    <div class="task-actions">
                        <button class="action-btn btn-delete" title="Delete"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
                <div class="task-meta-row">
                    <span class="recurring-schedule-badge"><i class="ph ph-arrows-clockwise"></i> Recurring</span>
                    <div class="recurring-day-tags">${dayTags}</div>
                    <span class="recurring-time-badge"><i class="ph ph-clock"></i> ${rt.timeOfDay || 'anytime'}</span>
                </div>
            `;

            li.querySelector('.btn-delete')?.addEventListener('click', () => {
                li.style.animation = 'fadeOut 0.3s ease forwards';
                setTimeout(() => { deleteRecurringTask(rt.id); renderTasks(); }, 280);
            });

            listEl.appendChild(li);
        });

        updateProgress();
    }

    // ===== RENDER HABITS IN TASK LIST =====
    function renderHabitsInTaskList() {
        const section = document.getElementById('habits-tasks-section');
        if (!section) return;
        if (habits.length === 0) {
            section.classList.add('hidden');
            return;
        }
        
        const listEl = document.getElementById('habits-task-list');
        listEl.innerHTML = '';
        section.classList.remove('hidden');

        habits.forEach(habit => {
            const done = isHabitDoneToday(habit);
            const li = document.createElement('li');
            li.className = `task-item ${done ? 'completed' : ''}`;
            
            let streakBadge = '';
            if (habit.streakEnabled && habit.currentStreak > 0) {
                streakBadge = `<span class="streak-badge">🔥 ${habit.currentStreak}d</span>`;
            }

            li.innerHTML = `
                <div class="task-main-row">
                    <input type="checkbox" class="task-checkbox" ${done ? 'checked' : ''}>
                    <input type="text" class="task-text" value="${escapeHTML(habit.name)}" readonly style="cursor:pointer;" title="Click to view habit">
                </div>
                ${streakBadge ? `<div class="task-meta-row">${streakBadge}</div>` : ''}
            `;

            li.querySelector('.task-checkbox').addEventListener('change', () => {
                quickLogHabit(habit.id);
                renderTasks();
                renderHabits(); // Also update habits screen if open
            });
            
            li.querySelector('.task-text').addEventListener('click', () => {
                openHabitDetail(habit.id);
            });

            listEl.appendChild(li);
        });
    }

    // "Add Daily Task" button in the daily section
    document.getElementById('btn-add-daily')?.addEventListener('click', () => {
        const name = prompt('Daily task name:');
        if (!name || !name.trim()) return;
        addDailyTask(name.trim());
        renderTasks();
    });

    // "Go to Habits" button in the habits section of tasks view
    document.getElementById('btn-add-habit-inline')?.addEventListener('click', () => {
        document.querySelector('.nav-tab[data-screen="habits"]')?.click();
    });

    // ===================================================================
    //  SECTION 6: AI BREAKDOWN
    // ===================================================================
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
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: `Break down the following task into 3 to 5 very short, actionable subtasks. Return ONLY a valid JSON array of strings. No markdown, no backticks, no other text. Task: "${text}"` }] }] })
            });
            if (!res.ok) throw new Error('API Error');
            const data = await res.json();
            const raw = data.candidates[0].content.parts[0].text;
            const subtasks = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());
            const deadline = document.getElementById('task-date').value || '';
            const parent = addTask(text + ' (AI Planned)', deadline, null, {
                points: parseInt(document.getElementById('task-points').value) || 10,
                workload: parseInt(document.getElementById('task-workload').value) || 5,
            });
            subtasks.forEach(sub => addTask(sub, '', parent.id));
        } catch (err) {
            console.error(err);
            alert("Failed to generate subtasks. Please check your API key.");
        }
        saveTasks();
        renderTasks();
        taskInput.value = '';
        taskInput.disabled = false; btnAi.disabled = false;
        inputWrapper.classList.remove('ai-thinking');
        taskInput.focus();
    });

    // ===================================================================
    //  SECTION 7: POMODORO
    // ===================================================================
    let pomSettings = JSON.parse(localStorage.getItem('pomodoro_settings') || '{"focusMinutes":25,"shortBreakMinutes":5,"longBreakMinutes":15,"sessionsBeforeLong":4}');
    let pomStats = JSON.parse(localStorage.getItem('pomodoro_stats') || '{}');

    let pomSecs = pomSettings.focusMinutes * 60;
    let pomTotalSecs = pomSecs;
    let pomRunning = false;
    let pomInterval = null;
    let pomSession = 1;
    let pomMode = 'focus'; // 'focus' | 'shortBreak' | 'longBreak'

    const pomTimeEl = document.getElementById('pomo-time');
    const pomRingFill = document.getElementById('pomo-ring-fill');
    const pomModeLabel = document.getElementById('pomo-mode-label');
    const pomSessionLabel = document.getElementById('pomo-session-label');
    const pomDotsEl = document.getElementById('pomo-dots');
    const pomPlayBtn = document.getElementById('pomo-play');
    const RING_CIRCUMFERENCE = 2 * Math.PI * 108;

    // Populate settings inputs
    document.getElementById('pomo-set-focus').value = pomSettings.focusMinutes;
    document.getElementById('pomo-set-short').value = pomSettings.shortBreakMinutes;
    document.getElementById('pomo-set-long').value = pomSettings.longBreakMinutes;
    document.getElementById('pomo-set-sessions').value = pomSettings.sessionsBeforeLong;

    function updatePomDisplay() {
        const m = Math.floor(pomSecs / 60).toString().padStart(2, '0');
        const s = (pomSecs % 60).toString().padStart(2, '0');
        pomTimeEl.textContent = `${m}:${s}`;

        // Ring progress
        const progress = pomTotalSecs > 0 ? (pomTotalSecs - pomSecs) / pomTotalSecs : 0;
        pomRingFill.style.strokeDasharray = RING_CIRCUMFERENCE;
        pomRingFill.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

        // Mode label
        if (pomMode === 'focus') {
            pomModeLabel.textContent = 'Focus Time';
            pomModeLabel.classList.remove('break-mode');
            pomRingFill.classList.remove('break-mode');
        } else {
            pomModeLabel.textContent = pomMode === 'shortBreak' ? 'Short Break' : 'Long Break';
            pomModeLabel.classList.add('break-mode');
            pomRingFill.classList.add('break-mode');
        }

        pomSessionLabel.textContent = `Session ${pomSession} of ${pomSettings.sessionsBeforeLong}`;
        renderPomDots();
    }

    function renderPomDots() {
        pomDotsEl.innerHTML = '';
        for (let i = 1; i <= pomSettings.sessionsBeforeLong; i++) {
            const dot = document.createElement('div');
            dot.className = 'pomo-dot';
            if (i < pomSession) dot.classList.add('done');
            if (i === pomSession) dot.classList.add('active');
            pomDotsEl.appendChild(dot);
        }
    }

    function startPom() {
        pomRunning = true;
        pomPlayBtn.querySelector('i').className = 'ph ph-pause';
        pomInterval = setInterval(() => {
            pomSecs--;
            if (pomSecs < 0) {
                clearInterval(pomInterval);
                pomRunning = false;
                pomPlayBtn.querySelector('i').className = 'ph ph-play';
                onPomComplete();
            }
            updatePomDisplay();
        }, 1000);
    }

    function pausePom() {
        clearInterval(pomInterval);
        pomRunning = false;
        pomPlayBtn.querySelector('i').className = 'ph ph-play';
    }

    function onPomComplete() {
        // Play chime
        playChime();

        if (pomMode === 'focus') {
            // Record stats
            const today = todayStr();
            if (!pomStats[today]) pomStats[today] = { focusMinutes: 0, sessionsCompleted: 0 };
            pomStats[today].focusMinutes += pomSettings.focusMinutes;
            pomStats[today].sessionsCompleted++;
            localStorage.setItem('pomodoro_stats', JSON.stringify(pomStats));
            updatePomStats();

            // Next: break
            if (pomSession >= pomSettings.sessionsBeforeLong) {
                switchPomMode('longBreak');
            } else {
                switchPomMode('shortBreak');
            }
        } else {
            // Break complete → next focus
            if (pomMode === 'longBreak') pomSession = 1;
            else pomSession++;
            switchPomMode('focus');
        }
    }

    function switchPomMode(mode) {
        pomMode = mode;
        if (mode === 'focus') pomSecs = pomSettings.focusMinutes * 60;
        else if (mode === 'shortBreak') pomSecs = pomSettings.shortBreakMinutes * 60;
        else pomSecs = pomSettings.longBreakMinutes * 60;
        pomTotalSecs = pomSecs;
        updatePomDisplay();
    }

    function playChime() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.setValueAtTime(600, ctx.currentTime + 0.15);
            osc.frequency.setValueAtTime(800, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.6);
        } catch (e) { /* silent fail */ }

        // Browser notification
        if (Notification.permission === 'granted') {
            new Notification('Pomodoro', { body: pomMode === 'focus' ? 'Focus session complete! Take a break.' : 'Break is over! Time to focus.' });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }

    pomPlayBtn.addEventListener('click', () => {
        if (pomRunning) pausePom(); else startPom();
    });

    document.getElementById('pomo-reset').addEventListener('click', () => {
        pausePom();
        switchPomMode(pomMode);
    });

    document.getElementById('pomo-skip').addEventListener('click', () => {
        pausePom();
        onPomComplete();
    });

    // Manual break trigger
    const breakBtn = document.getElementById('pomo-take-break');
    const breakDropdown = document.getElementById('break-dropdown');
    breakBtn.addEventListener('click', () => breakDropdown.classList.toggle('hidden'));
    document.querySelectorAll('.break-option').forEach(opt => {
        opt.addEventListener('click', () => {
            pausePom();
            switchPomMode(opt.dataset.break === 'long' ? 'longBreak' : 'shortBreak');
            breakDropdown.classList.add('hidden');
        });
    });

    // Settings
    document.getElementById('pomo-toggle-settings').addEventListener('click', () => {
        document.getElementById('pomo-settings-body').classList.toggle('hidden');
    });
    document.getElementById('pomo-save-settings').addEventListener('click', () => {
        pomSettings.focusMinutes = parseInt(document.getElementById('pomo-set-focus').value) || 25;
        pomSettings.shortBreakMinutes = parseInt(document.getElementById('pomo-set-short').value) || 5;
        pomSettings.longBreakMinutes = parseInt(document.getElementById('pomo-set-long').value) || 15;
        pomSettings.sessionsBeforeLong = parseInt(document.getElementById('pomo-set-sessions').value) || 4;
        localStorage.setItem('pomodoro_settings', JSON.stringify(pomSettings));
        pausePom();
        pomSession = 1;
        switchPomMode('focus');
        document.getElementById('pomo-settings-body').classList.add('hidden');
    });

    // Task link select
    function populatePomodoroTaskSelect() {
        const sel = document.getElementById('pomo-task-select');
        sel.innerHTML = '<option value="">— No task linked —</option>';
        tasks.filter(t => !t.completed && !t.parentId).forEach(t => {
            sel.innerHTML += `<option value="${t.id}">${escapeHTML(t.text)}</option>`;
        });
    }

    function updatePomStats() {
        const today = todayStr();
        const stats = pomStats[today] || { focusMinutes: 0, sessionsCompleted: 0 };
        document.getElementById('pomo-stat-time').textContent = `${stats.focusMinutes} min`;
        document.getElementById('pomo-stat-sessions').textContent = stats.sessionsCompleted;

        // Calculate streak
        let streak = 0;
        const d = new Date();
        for (let i = 0; i < 365; i++) {
            const key = d.toISOString().split('T')[0];
            if (pomStats[key] && pomStats[key].sessionsCompleted > 0) {
                streak++;
                d.setDate(d.getDate() - 1);
            } else {
                break;
            }
        }
        document.getElementById('pomo-stat-streak').textContent = `${streak} day${streak !== 1 ? 's' : ''}`;
    }

    updatePomDisplay();
    updatePomStats();

    // ===================================================================
    //  SECTION 8: HABITS
    // ===================================================================
    let habits = JSON.parse(localStorage.getItem('habits') || '[]');
    function saveHabits() { localStorage.setItem('habits', JSON.stringify(habits)); }

    let editingHabitId = null;
    let viewingHabitId = null;

    function renderHabits() {
        const grid = document.getElementById('habits-grid');
        const empty = document.getElementById('habits-empty');
        grid.innerHTML = '';

        if (habits.length === 0) {
            grid.appendChild(empty);
            return;
        }

        habits.forEach(habit => {
            recalcHabitStreak(habit);
            const card = document.createElement('div');
            card.className = 'habit-card';
            const doneToday = isHabitDoneToday(habit);
            const today = todayStr();
            const entry = habit.entries?.[today];

            // Weekly progress for measurable
            let progressHtml = '';
            if (habit.targetType === 'measurable' && habit.targetValue) {
                const val = entry?.value || 0;
                const pct = Math.min(100, Math.round((val / habit.targetValue) * 100));
                progressHtml = `<div class="habit-card-progress"><div class="habit-card-progress-fill" style="width:${pct}%"></div></div>`;
            }

            let statusText = doneToday ? '✅ Done today' : 'Not done today';
            if (habit.targetType === 'measurable' && entry?.value) {
                statusText = `${entry.value}/${habit.targetValue} ${habit.unit || ''}`;
            }

            // Current plan target
            let planTargetText = '';
            if (habit.plan && habit.plan.length) {
                const currentTarget = getCurrentPlanTarget(habit);
                if (currentTarget !== null) planTargetText = `<span style="font-size:0.72rem;color:var(--accent-light);">📈 Target: ${currentTarget} ${habit.unit || ''}</span>`;
            }

            card.innerHTML = `
                <div class="habit-card-top">
                    <div>
                        <div class="habit-card-name">${escapeHTML(habit.name)}</div>
                        ${habit.description ? `<div class="habit-card-desc">${escapeHTML(habit.description)}</div>` : ''}
                    </div>
                    ${habit.streakEnabled ? `<div class="habit-card-streak"><span class="fire">🔥</span> ${habit.currentStreak}</div>` : ''}
                </div>
                ${progressHtml}
                ${planTargetText}
                <div class="habit-card-footer">
                    <span class="habit-card-status">${statusText}</span>
                    <button class="habit-check-btn ${doneToday ? 'done' : ''}" data-habit-id="${habit.id}">
                        <i class="ph ph-check"></i>
                    </button>
                </div>
            `;

            card.addEventListener('click', (e) => {
                if (e.target.closest('.habit-check-btn')) return;
                openHabitDetail(habit.id);
            });

            card.querySelector('.habit-check-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                quickLogHabit(habit.id);
                renderHabits();
            });

            grid.appendChild(card);
        });
    }

    function isHabitDoneToday(habit) {
        const entry = habit.entries?.[todayStr()];
        return entry?.done === true;
    }

    function quickLogHabit(id) {
        const habit = habits.find(h => h.id === id);
        if (!habit) return;
        if (!habit.entries) habit.entries = {};
        const today = todayStr();
        if (habit.targetType === 'checkin') {
            habit.entries[today] = { done: !habit.entries[today]?.done, value: null };
        } else {
            const current = habit.entries[today]?.value || 0;
            const val = prompt(`Enter value (${habit.unit || 'units'}):`, current);
            if (val === null) return;
            const numVal = parseFloat(val) || 0;
            habit.entries[today] = { done: numVal >= (habit.targetValue || 1), value: numVal };
        }
        recalcHabitStreak(habit);
        saveHabits();
    }

    function recalcHabitStreak(habit) {
        if (!habit.streakEnabled) { habit.currentStreak = 0; return; }
        let streak = 0;
        const d = new Date();
        for (let i = 0; i < 365; i++) {
            const key = d.toISOString().split('T')[0];
            if (habit.entries?.[key]?.done) {
                streak++;
                d.setDate(d.getDate() - 1);
            } else {
                break;
            }
        }
        habit.currentStreak = streak;
        if (streak > (habit.bestStreak || 0)) habit.bestStreak = streak;
    }

    function getCurrentPlanTarget(habit) {
        if (!habit.plan || !habit.plan.length) return null;
        const created = new Date(habit.createdAt + 'T00:00:00');
        const now = new Date();
        const weeksElapsed = Math.floor((now - created) / (7 * 24 * 60 * 60 * 1000)) + 1;
        for (const step of habit.plan) {
            if (weeksElapsed >= step.weekStart && weeksElapsed <= step.weekEnd) return step.target;
        }
        return habit.plan[habit.plan.length - 1]?.target || null;
    }

    // ===== HABIT CREATE/EDIT MODAL =====
    document.getElementById('btn-add-habit').addEventListener('click', () => {
        editingHabitId = null;
        document.getElementById('habit-modal-title').textContent = 'New Habit';
        clearHabitForm();
        document.getElementById('habit-modal').classList.remove('hidden');
    });
    document.getElementById('btn-close-habit-modal').addEventListener('click', () => {
        document.getElementById('habit-modal').classList.add('hidden');
    });

    document.getElementById('habit-target-type').addEventListener('change', () => {
        document.getElementById('habit-measurable-fields').classList.toggle(
            'hidden', document.getElementById('habit-target-type').value !== 'measurable'
        );
    });

    function clearHabitForm() {
        document.getElementById('habit-name').value = '';
        document.getElementById('habit-desc').value = '';
        document.getElementById('habit-target-type').value = 'checkin';
        document.getElementById('habit-target-value').value = '30';
        document.getElementById('habit-unit').value = '';
        document.getElementById('habit-frequency').value = 'daily';
        document.getElementById('habit-streak-toggle').checked = true;
        document.getElementById('habit-plan-desc').value = '';
        document.getElementById('habit-measurable-fields').classList.add('hidden');
        document.getElementById('ai-plan-result').classList.add('hidden');
        document.getElementById('plan-table-body').innerHTML = '';
    }

    document.getElementById('btn-save-habit').addEventListener('click', () => {
        const name = document.getElementById('habit-name').value.trim();
        if (!name) return alert('Please enter a habit name.');

        const plan = [];
        document.querySelectorAll('#plan-table-body tr').forEach(row => {
            const inputs = row.querySelectorAll('input');
            if (inputs.length >= 3) {
                plan.push({
                    weekStart: parseInt(inputs[0].value) || 1,
                    weekEnd: parseInt(inputs[1].value) || 1,
                    target: parseFloat(inputs[2].value) || 0,
                });
            }
        });

        if (editingHabitId) {
            habits = habits.map(h => h.id === editingHabitId ? {
                ...h,
                name,
                description: document.getElementById('habit-desc').value.trim(),
                targetType: document.getElementById('habit-target-type').value,
                targetValue: parseFloat(document.getElementById('habit-target-value').value) || 30,
                unit: document.getElementById('habit-unit').value.trim(),
                frequency: document.getElementById('habit-frequency').value,
                streakEnabled: document.getElementById('habit-streak-toggle').checked,
                planDescription: document.getElementById('habit-plan-desc').value.trim(),
                plan: plan.length ? plan : h.plan,
            } : h);
        } else {
            habits.push({
                id: Date.now() + Math.random(),
                name,
                description: document.getElementById('habit-desc').value.trim(),
                targetType: document.getElementById('habit-target-type').value,
                targetValue: parseFloat(document.getElementById('habit-target-value').value) || 30,
                unit: document.getElementById('habit-unit').value.trim(),
                frequency: document.getElementById('habit-frequency').value,
                streakEnabled: document.getElementById('habit-streak-toggle').checked,
                currentStreak: 0, bestStreak: 0,
                entries: {},
                plan: plan,
                planDescription: document.getElementById('habit-plan-desc').value.trim(),
                createdAt: todayStr(),
            });
        }
        saveHabits();
        document.getElementById('habit-modal').classList.add('hidden');
        renderHabits();
    });

    // ===== AI PLAN GENERATION =====
    document.getElementById('btn-generate-plan').addEventListener('click', async () => {
        const desc = document.getElementById('habit-plan-desc').value.trim();
        if (!desc) return alert('Please describe your goal first.');
        if (!geminiApiKey) {
            alert("Please add your Gemini API Key in Settings first!");
            document.getElementById('settings-modal').classList.remove('hidden');
            return;
        }

        const btn = document.getElementById('btn-generate-plan');
        btn.classList.add('loading');
        btn.innerHTML = '<i class="ph ph-sparkle"></i> Generating...';

        try {
            const habitName = document.getElementById('habit-name').value.trim();
            const unit = document.getElementById('habit-unit').value.trim() || 'units';
            const prompt = `You are a habit coach. The user wants to build a habit: "${habitName}". Here is their description: "${desc}". Create a progressive scaling plan in 4-8 steps. Each step has a week range (e.g., week 1-2) and a target value. Return ONLY a valid JSON array of objects with keys: weekStart (number), weekEnd (number), target (number). No markdown, no backticks, no other text. Example: [{"weekStart":1,"weekEnd":2,"target":5}]`;

            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            if (!res.ok) throw new Error('API Error');
            const data = await res.json();
            const raw = data.candidates[0].content.parts[0].text;
            const plan = JSON.parse(raw.replace(/```json/g, '').replace(/```/g, '').trim());

            renderPlanTable(plan);
            document.getElementById('ai-plan-result').classList.remove('hidden');
        } catch (err) {
            console.error(err);
            alert("Failed to generate plan. Check your API key.");
        }

        btn.classList.remove('loading');
        btn.innerHTML = '<i class="ph ph-sparkle"></i> Generate Plan';
    });

    function renderPlanTable(plan) {
        const tbody = document.getElementById('plan-table-body');
        tbody.innerHTML = '';
        plan.forEach((step, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="number" value="${step.weekStart}" style="width:40px"> – <input type="number" value="${step.weekEnd}" style="width:40px"></td>
                <td><input type="number" value="${step.target}"></td>
                <td><button class="btn-remove-row" title="Remove"><i class="ph ph-x"></i></button></td>
            `;
            tr.querySelector('.btn-remove-row').addEventListener('click', () => { tr.remove(); });
            tbody.appendChild(tr);
        });
    }

    document.getElementById('btn-add-plan-row').addEventListener('click', () => {
        const tbody = document.getElementById('plan-table-body');
        const lastRow = tbody.lastElementChild;
        const lastEnd = lastRow ? parseInt(lastRow.querySelectorAll('input')[1].value) || 0 : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="number" value="${lastEnd + 1}" style="width:40px"> – <input type="number" value="${lastEnd + 2}" style="width:40px"></td>
            <td><input type="number" value="0"></td>
            <td><button class="btn-remove-row" title="Remove"><i class="ph ph-x"></i></button></td>
        `;
        tr.querySelector('.btn-remove-row').addEventListener('click', () => { tr.remove(); });
        tbody.appendChild(tr);
    });

    // ===== HABIT DETAIL MODAL =====
    function openHabitDetail(id) {
        viewingHabitId = id;
        const habit = habits.find(h => h.id === id);
        if (!habit) return;

        const modal = document.getElementById('habit-detail-modal');
        document.getElementById('habit-detail-title').textContent = habit.name;
        document.getElementById('hd-streak').textContent = habit.currentStreak;
        document.getElementById('hd-best-streak').textContent = habit.bestStreak || 0;

        // Quick log button
        const logBtn = document.getElementById('hd-log-btn');
        const logValInput = document.getElementById('hd-log-value');
        const logUnit = document.getElementById('hd-log-unit');
        const doneToday = isHabitDoneToday(habit);

        if (habit.targetType === 'measurable') {
            logValInput.classList.remove('hidden');
            logUnit.classList.remove('hidden');
            logUnit.textContent = habit.unit || '';
            logValInput.value = habit.entries?.[todayStr()]?.value || '';
            logBtn.innerHTML = '<i class="ph ph-check"></i> Save';
        } else {
            logValInput.classList.add('hidden');
            logUnit.classList.add('hidden');
            logBtn.innerHTML = doneToday ? '<i class="ph ph-check"></i> Done ✓' : '<i class="ph ph-check"></i> Mark Done';
            logBtn.classList.toggle('done', doneToday);
        }

        // Plan section
        const planSection = document.getElementById('hd-plan-section');
        if (habit.plan && habit.plan.length) {
            planSection.classList.remove('hidden');
            const target = getCurrentPlanTarget(habit);
            document.getElementById('hd-plan-current').textContent = target !== null
                ? `${target} ${habit.unit || ''} this week` : 'Plan completed 🎉';
        } else {
            planSection.classList.add('hidden');
        }

        // Render heatmap
        renderHeatmap(habit);

        // Render chart
        renderChart(habit);

        // Render streak timeline
        renderStreakTimeline(habit);

        // Render milestones
        renderMilestones(habit);

        modal.classList.remove('hidden');
    }

    document.getElementById('btn-close-habit-detail').addEventListener('click', () => {
        document.getElementById('habit-detail-modal').classList.add('hidden');
    });

    document.getElementById('hd-log-btn').addEventListener('click', () => {
        const habit = habits.find(h => h.id === viewingHabitId);
        if (!habit) return;
        if (!habit.entries) habit.entries = {};
        const today = todayStr();

        if (habit.targetType === 'measurable') {
            const val = parseFloat(document.getElementById('hd-log-value').value) || 0;
            habit.entries[today] = { done: val >= (habit.targetValue || 1), value: val };
        } else {
            habit.entries[today] = { done: !habit.entries[today]?.done, value: null };
        }
        recalcHabitStreak(habit);
        saveHabits();
        openHabitDetail(viewingHabitId);
        renderHabits();
    });

    document.getElementById('btn-edit-habit').addEventListener('click', () => {
        const habit = habits.find(h => h.id === viewingHabitId);
        if (!habit) return;
        document.getElementById('habit-detail-modal').classList.add('hidden');
        editingHabitId = habit.id;
        document.getElementById('habit-modal-title').textContent = 'Edit Habit';
        document.getElementById('habit-name').value = habit.name;
        document.getElementById('habit-desc').value = habit.description || '';
        document.getElementById('habit-target-type').value = habit.targetType;
        document.getElementById('habit-target-value').value = habit.targetValue || 30;
        document.getElementById('habit-unit').value = habit.unit || '';
        document.getElementById('habit-frequency').value = habit.frequency;
        document.getElementById('habit-streak-toggle').checked = habit.streakEnabled;
        document.getElementById('habit-plan-desc').value = habit.planDescription || '';
        document.getElementById('habit-measurable-fields').classList.toggle('hidden', habit.targetType !== 'measurable');
        if (habit.plan && habit.plan.length) {
            renderPlanTable(habit.plan);
            document.getElementById('ai-plan-result').classList.remove('hidden');
        }
        document.getElementById('habit-modal').classList.remove('hidden');
    });

    document.getElementById('btn-delete-habit').addEventListener('click', () => {
        if (!confirm('Delete this habit? This cannot be undone.')) return;
        habits = habits.filter(h => h.id !== viewingHabitId);
        saveHabits();
        document.getElementById('habit-detail-modal').classList.add('hidden');
        renderHabits();
    });

    // ===== HEATMAP (SVG) =====
    function renderHeatmap(habit) {
        const container = document.getElementById('hd-heatmap');
        container.innerHTML = '';
        const cellSize = 14;
        const gap = 3;
        const weeks = 16;
        const days = 7;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', weeks * (cellSize + gap));
        svg.setAttribute('height', days * (cellSize + gap) + 20);

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (weeks * 7));

        // Month labels
        let lastMonth = -1;
        for (let w = 0; w < weeks; w++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + w * 7);
            if (d.getMonth() !== lastMonth) {
                lastMonth = d.getMonth();
                const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                txt.setAttribute('x', w * (cellSize + gap));
                txt.setAttribute('y', 12);
                txt.setAttribute('fill', '#a0a5b1');
                txt.setAttribute('font-size', '10');
                txt.setAttribute('font-family', 'Inter, sans-serif');
                txt.textContent = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][lastMonth];
                svg.appendChild(txt);
            }
        }

        // Cells
        for (let w = 0; w < weeks; w++) {
            for (let day = 0; day < days; day++) {
                const cellDate = new Date(startDate);
                cellDate.setDate(cellDate.getDate() + w * 7 + day);
                const key = cellDate.toISOString().split('T')[0];

                if (cellDate > endDate) continue;

                const entry = habit.entries?.[key];
                let intensity = 0;
                if (entry?.done) {
                    if (habit.targetType === 'measurable' && habit.targetValue) {
                        intensity = Math.min(1, (entry.value || 0) / habit.targetValue);
                    } else {
                        intensity = 1;
                    }
                }

                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', w * (cellSize + gap));
                rect.setAttribute('y', 18 + day * (cellSize + gap));
                rect.setAttribute('width', cellSize);
                rect.setAttribute('height', cellSize);
                rect.setAttribute('rx', 3);

                if (intensity === 0) {
                    rect.setAttribute('fill', 'rgba(255,255,255,0.04)');
                } else if (intensity < 0.33) {
                    rect.setAttribute('fill', 'rgba(99,102,241,0.2)');
                } else if (intensity < 0.66) {
                    rect.setAttribute('fill', 'rgba(99,102,241,0.45)');
                } else {
                    rect.setAttribute('fill', 'rgba(99,102,241,0.8)');
                }

                const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                title.textContent = `${key}: ${entry?.done ? (entry.value || 'Done') : 'Not done'}`;
                rect.appendChild(title);

                svg.appendChild(rect);
            }
        }

        container.appendChild(svg);
    }

    // ===== WEEKLY CHART (Canvas) =====
    function renderChart(habit) {
        const canvas = document.getElementById('hd-chart');
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth * 2 || 1200;
        canvas.height = 400;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Get last 12 weeks of data
        const weeksData = [];
        for (let w = 11; w >= 0; w--) {
            const weekEnd = new Date();
            weekEnd.setDate(weekEnd.getDate() - w * 7);
            let count = 0;
            let total = 0;
            for (let d = 6; d >= 0; d--) {
                const day = new Date(weekEnd);
                day.setDate(day.getDate() - d);
                const key = day.toISOString().split('T')[0];
                const entry = habit.entries?.[key];
                if (entry?.done) count++;
                if (habit.targetType === 'measurable' && entry?.value) total += entry.value;
            }
            weeksData.push({
                label: `W${12 - w}`,
                count,
                total: habit.targetType === 'measurable' ? total : count,
            });
        }

        const padding = { top: 30, right: 30, bottom: 40, left: 50 };
        const chartW = canvas.width - padding.left - padding.right;
        const chartH = canvas.height - padding.top - padding.bottom;
        const maxVal = Math.max(7, ...weeksData.map(w => w.total)) * 1.1;
        const barWidth = chartW / weeksData.length * 0.6;
        const barGap = chartW / weeksData.length;

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(canvas.width - padding.right, y);
            ctx.stroke();

            ctx.fillStyle = '#a0a5b1';
            ctx.font = '20px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), padding.left - 10, y + 6);
        }

        // Bars
        weeksData.forEach((w, i) => {
            const x = padding.left + i * barGap + (barGap - barWidth) / 2;
            const h = (w.total / maxVal) * chartH;
            const y = padding.top + chartH - h;

            // Gradient bar
            const grad = ctx.createLinearGradient(x, y, x, y + h);
            grad.addColorStop(0, 'rgba(99,102,241,0.9)');
            grad.addColorStop(1, 'rgba(99,102,241,0.3)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(x, y, barWidth, h, 6);
            } else {
                ctx.rect(x, y, barWidth, h);
            }
            ctx.fill();

            // Label
            ctx.fillStyle = '#a0a5b1';
            ctx.font = '18px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(w.label, x + barWidth / 2, canvas.height - padding.bottom + 24);
        });

        // Line overlay
        ctx.beginPath();
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 3;
        weeksData.forEach((w, i) => {
            const x = padding.left + i * barGap + barGap / 2;
            const y = padding.top + chartH - (w.total / maxVal) * chartH;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Dots on line
        weeksData.forEach((w, i) => {
            const x = padding.left + i * barGap + barGap / 2;
            const y = padding.top + chartH - (w.total / maxVal) * chartH;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#a5b4fc';
            ctx.fill();
            ctx.strokeStyle = '#191c23';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }

    // ===== STREAK TIMELINE =====
    function renderStreakTimeline(habit) {
        const container = document.getElementById('hd-streak-timeline');
        container.innerHTML = '';
        const days = 90;
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            const entry = habit.entries?.[key];
            const div = document.createElement('div');
            div.className = 'streak-day';
            if (entry?.done) div.classList.add('done');
            else if (new Date(key) < new Date(habit.createdAt)) div.classList.add('empty');
            else div.classList.add('missed');
            div.title = key;
            container.appendChild(div);
        }
    }

    // ===== MILESTONES =====
    function renderMilestones(habit) {
        const container = document.getElementById('hd-milestones');
        container.innerHTML = '';
        const milestones = [7, 21, 30, 60, 90, 180, 365];
        milestones.forEach(m => {
            const badge = document.createElement('div');
            const earned = (habit.bestStreak || 0) >= m;
            badge.className = `milestone-badge ${earned ? 'earned' : 'locked'}`;
            badge.innerHTML = `${earned ? '🏆' : '🔒'} ${m} days`;
            container.appendChild(badge);
        });
    }

    // ===================================================================
    //  SECTION 9: SETTINGS MODAL
    // ===================================================================
    const settingsModal = document.getElementById('settings-modal');
    const apiKeyInput = document.getElementById('api-key-input');
    document.getElementById('btn-settings')?.addEventListener('click', () => {
        apiKeyInput.value = geminiApiKey;
        settingsModal.classList.remove('hidden');
    });
    document.getElementById('btn-close-settings')?.addEventListener('click', () => settingsModal.classList.add('hidden'));
    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
        geminiApiKey = apiKeyInput.value.trim();
        localStorage.setItem('gemini_api_key', geminiApiKey);
        settingsModal.classList.add('hidden');
    });

    // ===================================================================
    //  SECTION 10: MINI CALENDAR
    // ===================================================================
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

        const totalCells = firstDay + daysInMonth;
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let i = 1; i <= remaining; i++) {
            const cell = document.createElement('div');
            cell.className = 'cal-day other-month';
            cell.textContent = i;
            grid.appendChild(cell);
        }
    }

    function getTasksForDate(dateStr) { return tasks.filter(t => t.deadline === dateStr); }

    // ===================================================================
    //  SECTION 11: FULL-SCREEN CALENDAR
    // ===================================================================
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
                <input type="text" class="task-text" value="${escapeHTML(task.text)}" readonly>
                <div class="cal-task-actions">
                    ${!task.parentId ? `<button class="cal-action-btn btn-add-subtask" title="Add Subtask"><i class="ph ph-plus-circle"></i></button>` : ''}
                    <button class="cal-action-btn btn-edit-task" title="Edit"><i class="ph ph-pencil"></i></button>
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

        div.querySelector('.btn-edit-task')?.addEventListener('click', () => {
            openEditTaskModal(task.id);
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

    // ===================================================================
    //  SECTION 12: AI ASSISTANT CHAT (Part 1 — UI Scaffolding)
    // ===================================================================
    const chatMessagesEl = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const btnSendChat = document.getElementById('btn-send-chat');
    const chatSuggestions = document.getElementById('chat-suggestions');
    const chatStatusEl = document.getElementById('chat-status');
    let chatHistory = []; // session-only chat history

    // ===== Welcome Message =====
    function renderWelcomeMessage() {
        chatMessagesEl.innerHTML = `
            <div class="chat-welcome">
                <div class="chat-welcome-icon">
                    <i class="ph ph-robot"></i>
                </div>
                <h3>Hey Anushka! 👋</h3>
                <p>I'm your personal task assistant. Tell me what you need to do — I'll add tasks, set up daily routines, or schedule recurring tasks for any day of the week.</p>
            </div>
        `;
    }
    renderWelcomeMessage();

    // ===== Textarea Auto-grow =====
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
        btnSendChat.disabled = !chatInput.value.trim();
    });

    // ===== Send on Enter (Shift+Enter for newline) =====
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (chatInput.value.trim()) sendChatMessage();
        }
    });

    btnSendChat.addEventListener('click', () => {
        if (chatInput.value.trim()) sendChatMessage();
    });

    // ===== Suggestion Chips =====
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chatInput.value = chip.dataset.suggestion;
            chatInput.dispatchEvent(new Event('input'));
            sendChatMessage();
        });
    });

    // ===== Clear Chat =====
    document.getElementById('btn-clear-chat').addEventListener('click', () => {
        chatHistory = [];
        renderWelcomeMessage();
        chatSuggestions.classList.remove('hidden');
    });

    // ===== FAB Button =====
    document.getElementById('fab-assistant')?.addEventListener('click', () => {
        document.querySelector('.nav-tab[data-screen="assistant"]')?.click();
    });

    // ===== Chat Message Rendering =====
    function getTimeString() {
        return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    function addUserMessage(text) {
        // Remove welcome if it's the first message
        const welcome = chatMessagesEl.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        const msg = document.createElement('div');
        msg.className = 'chat-msg user';
        msg.innerHTML = `
            <div class="msg-avatar"><i class="ph ph-user"></i></div>
            <div class="msg-content">
                <div class="msg-bubble">${escapeHTML(text)}</div>
                <span class="msg-time">${getTimeString()}</span>
            </div>
        `;
        chatMessagesEl.appendChild(msg);
        scrollChatToBottom();
    }

    function addAIMessage(text, actionCardHtml = '') {
        // Remove typing indicator
        removeTypingIndicator();

        const msg = document.createElement('div');
        msg.className = 'chat-msg ai';
        msg.innerHTML = `
            <div class="msg-avatar"><i class="ph ph-robot"></i></div>
            <div class="msg-content">
                <div class="msg-bubble">${text}${actionCardHtml}</div>
                <span class="msg-time">${getTimeString()}</span>
            </div>
        `;
        chatMessagesEl.appendChild(msg);
        scrollChatToBottom();
    }

    function addTypingIndicator() {
        removeTypingIndicator();
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.id = 'typing-indicator';
        indicator.innerHTML = `
            <div class="msg-avatar"><i class="ph ph-robot"></i></div>
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
        chatMessagesEl.appendChild(indicator);
        scrollChatToBottom();
    }

    function removeTypingIndicator() {
        document.getElementById('typing-indicator')?.remove();
    }

    function scrollChatToBottom() {
        requestAnimationFrame(() => {
            chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
        });
    }

    // ===== Send Message (Part 1 — placeholder, real AI integration in Part 2) =====
    async function sendChatMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        // Hide suggestions after first message
        chatSuggestions.classList.add('hidden');

        // Add user message
        addUserMessage(text);
        chatHistory.push({ role: 'user', text });

        // Clear input
        chatInput.value = '';
        chatInput.style.height = 'auto';
        btnSendChat.disabled = true;

        // Update status
        chatStatusEl.textContent = 'Thinking...';

        // Show typing indicator
        addTypingIndicator();

        // ===== PLACEHOLDER — will be replaced in Part 2 with real Gemini API call =====
        try {
            await processAssistantMessage(text);
        } catch (err) {
            removeTypingIndicator();
            addAIMessage("Sorry, I encountered an error. Please make sure your Gemini API key is set in Settings.");
            console.error('Assistant error:', err);
        }

        // Reset status
        chatStatusEl.textContent = 'Online — ready to help';
    }

    // ===== Real Gemini API Integration =====
    async function processAssistantMessage(userText) {
        if (!geminiApiKey) {
            throw new Error('No API key');
        }

        const systemPrompt = `You are an AI personal task assistant for a productivity app.
The user will tell you what they want to do. Your job is to extract the intent and return a raw JSON object.
No markdown, no backticks, no conversational text. JUST valid JSON.

Actions you can take:
1. "add_task" - A one-time task. Fields: action, name, deadline (YYYY-MM-DD if applicable).
2. "add_daily" - A daily recurring task. Fields: action, name, timeOfDay (morning, afternoon, evening, anytime).
3. "add_recurring" - A custom recurring task. Fields: action, name, recurrenceType (weekly, custom), recurrenceDays (array of numbers 0-6 where 0=Sun, 6=Sat), timeOfDay (morning, afternoon, evening, anytime).
4. "list_tasks" - When the user asks what tasks they have today. Fields: action.
5. "general_chat" - For friendly greetings or unrecognized commands. Fields: action, message (a short friendly reply).

Use the current date: ${new Date().toISOString().split('T')[0]} as context for words like "tomorrow".
Example output for "remind me to go to the gym every monday and wednesday morning":
{"action": "add_recurring", "name": "Go to the gym", "recurrenceDays": [1, 3], "timeOfDay": "morning"}`;

        const requestBody = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [
                ...chatHistory.slice(0, -1).map(msg => ({
                    role: msg.role === 'ai' ? 'model' : 'user',
                    parts: [{ text: msg.text }]
                })),
                {
                    role: "user",
                    parts: [{ text: userText }]
                }
            ],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
            }
        };

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!res.ok) throw new Error('API Error: ' + res.status);
        const data = await res.json();
        const raw = data.candidates[0].content.parts[0].text;
        const parsed = JSON.parse(raw.trim());
        
        chatHistory.push({ role: 'ai', text: raw });

        await executeAssistantAction(parsed);
    }

    async function executeAssistantAction(parsed) {
        let aiResponseText = "";
        let actionCardHtml = "";

        if (parsed.action === 'add_task') {
            const task = addTask(parsed.name, parsed.deadline || null);
            aiResponseText = "I've added that task for you.";
            actionCardHtml = `
                <div class="msg-action-card">
                    <div class="action-card-header">
                        <i class="ph ph-check-circle"></i> Task Created
                    </div>
                    <div class="action-card-body">
                        <div class="action-card-row">
                            <span class="label">Task</span>
                            <span class="value">${escapeHTML(parsed.name)}</span>
                        </div>
                        ${parsed.deadline ? `<div class="action-card-row"><span class="label">Due</span><span class="value">${parsed.deadline}</span></div>` : ''}
                    </div>
                </div>
            `;
            renderTasks();
            if (typeof renderMiniCalendar === 'function') renderMiniCalendar();
        } 
        else if (parsed.action === 'add_daily') {
            addDailyTask(parsed.name, { timeOfDay: parsed.timeOfDay });
            aiResponseText = "Got it! I've set up a daily task.";
            actionCardHtml = `
                <div class="msg-action-card">
                    <div class="action-card-header">
                        <i class="ph ph-arrows-clockwise"></i> Daily Task Added
                    </div>
                    <div class="action-card-body">
                        <div class="action-card-row">
                            <span class="label">Routine</span>
                            <span class="value">${escapeHTML(parsed.name)}</span>
                        </div>
                        <div class="action-card-row">
                            <span class="label">Time</span>
                            <span class="value action-card-tag">${parsed.timeOfDay || 'anytime'}</span>
                        </div>
                    </div>
                </div>
            `;
            renderDailyTasks();
            updateProgress();
        }
        else if (parsed.action === 'add_recurring') {
            // Stub for addRecurringTask which we will fully implement in Part 3
            if (typeof addRecurringTask === 'function') {
                addRecurringTask(parsed.name, {
                    recurrenceDays: parsed.recurrenceDays || [],
                    timeOfDay: parsed.timeOfDay || 'anytime'
                });
            } else {
                console.warn("addRecurringTask will be implemented in Part 3. Adding to localStorage directly as a stub.");
                let rTasks = JSON.parse(localStorage.getItem('recurring_tasks') || '[]');
                rTasks.push({
                    id: Date.now() + Math.random(),
                    name: parsed.name,
                    recurrenceDays: parsed.recurrenceDays || [],
                    timeOfDay: parsed.timeOfDay || 'anytime',
                    createdAt: todayStr()
                });
                localStorage.setItem('recurring_tasks', JSON.stringify(rTasks));
                if (typeof renderRecurringTasks === 'function') renderRecurringTasks();
            }

            aiResponseText = "Scheduled! I've added a custom recurring task.";
            const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const daysStr = (parsed.recurrenceDays || []).map(d => daysMap[d]).join(', ');
            
            actionCardHtml = `
                <div class="msg-action-card">
                    <div class="action-card-header">
                        <i class="ph ph-calendar"></i> Recurring Task
                    </div>
                    <div class="action-card-body">
                        <div class="action-card-row">
                            <span class="label">Task</span>
                            <span class="value">${escapeHTML(parsed.name)}</span>
                        </div>
                        <div class="action-card-row">
                            <span class="label">Days</span>
                            <span class="value action-card-tag">${daysStr || 'Any'}</span>
                        </div>
                    </div>
                </div>
            `;
        }
        else if (parsed.action === 'list_tasks') {
            const pendingTasks = tasks.filter(t => !t.completed && !t.parentId);
            const daily = getDailyTasksForToday().filter(t => !isDailyDoneToday(t));
            const recurring = typeof getRecurringTasksForToday === 'function' ? getRecurringTasksForToday().filter(t => !isRecurringDoneToday(t)) : [];
            
            if (pendingTasks.length === 0 && daily.length === 0 && recurring.length === 0) {
                aiResponseText = "You're all caught up! No tasks left for today.";
            } else {
                aiResponseText = "Here is what's on your plate today:";
                actionCardHtml = `<div class="msg-action-card"><div class="action-card-body">`;
                if (daily.length > 0) {
                    actionCardHtml += `<div class="action-card-row"><span class="label">Daily</span><span class="value">${daily.length} left</span></div>`;
                }
                if (recurring.length > 0) {
                    actionCardHtml += `<div class="action-card-row"><span class="label">Recurring</span><span class="value">${recurring.length} left</span></div>`;
                }
                if (pendingTasks.length > 0) {
                    actionCardHtml += `<div class="action-card-row"><span class="label">To-do</span><span class="value">${pendingTasks.length} pending</span></div>`;
                }
                actionCardHtml += `</div></div>`;
            }
        }
        else if (parsed.action === 'general_chat') {
            aiResponseText = parsed.message || "I'm here to help you manage your tasks!";
        }
        else {
            aiResponseText = "I wasn't quite sure how to process that command.";
        }

        removeTypingIndicator();
        addAIMessage(aiResponseText, actionCardHtml);
    }

    // ===== INIT =====
    renderTasks();
    initMiniCal();
    renderHabits();
    if (typeof renderRecurringTasks === 'function') renderRecurringTasks();
});
