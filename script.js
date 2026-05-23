document.addEventListener('DOMContentLoaded', () => {
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const taskDateInput = document.getElementById('task-date');
    const taskList = document.getElementById('task-list');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const progressText = document.getElementById('progress-text');
    const progressPercentage = document.getElementById('progress-percentage');
    const progressBarFill = document.getElementById('progress-bar-fill');

    let currentFilter = 'all';
    let geminiApiKey = localStorage.getItem('gemini_api_key') || '';

    // Load tasks from LocalStorage
    const savedTasks = localStorage.getItem('ai_tasks');
    let tasks = savedTasks ? JSON.parse(savedTasks) : [];

    function saveTasks() {
        localStorage.setItem('ai_tasks', JSON.stringify(tasks));
    }

    function updateProgress() {
        if (!progressText || !progressPercentage || !progressBarFill) return;
        const total = tasks.length;
        const completed = tasks.filter(t => t.completed).length;
        const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

        progressText.textContent = `${completed}/${total} completed`;
        progressPercentage.textContent = `${percentage}%`;
        progressBarFill.style.width = `${percentage}%`;
    }

    function renderTasks() {
        taskList.innerHTML = '';

        const filteredTasks = tasks.filter(task => {
            if (currentFilter === 'pending') return !task.completed;
            if (currentFilter === 'completed') return task.completed;
            return true;
        });

        if (filteredTasks.length === 0) {
            taskList.innerHTML = `
                <div style="text-align: center; color: var(--text-secondary); padding: 2rem 0; font-size: 0.9rem;">
                    No tasks found.
                </div>
            `;
            updateProgress();
            return;
        }

        filteredTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''} ${task.isSubtask ? 'is-subtask' : ''}`;
            li.dataset.id = task.id;
            li.draggable = currentFilter === 'all';

            const isOverdue = task.deadline && new Date(task.deadline) < new Date(new Date().toDateString());
            const dateHtml = task.deadline ? `<span class="task-date-badge ${isOverdue ? 'overdue' : ''}">${task.deadline}</span>` : '';

            li.innerHTML = `
                <div class="task-content">
                    <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                    <input type="text" class="task-text" value="${escapeHTML(task.text)}" readonly>
                    ${dateHtml}
                </div>
                <div class="task-actions">
                    <button class="action-btn btn-delete" aria-label="Delete task">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            `;

            // Event Listeners for items
            const checkbox = li.querySelector('.task-checkbox');
            checkbox.addEventListener('change', () => toggleTask(task.id));

            const textInput = li.querySelector('.task-text');
            textInput.addEventListener('dblclick', () => {
                textInput.removeAttribute('readonly');
                textInput.focus();
            });
            textInput.addEventListener('blur', () => {
                textInput.setAttribute('readonly', true);
                updateTaskText(task.id, textInput.value);
            });
            textInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') textInput.blur();
            });

            const deleteBtn = li.querySelector('.btn-delete');
            deleteBtn.addEventListener('click', () => {
                li.style.animation = 'fadeOut 0.3s ease forwards';
                setTimeout(() => deleteTask(task.id), 300);
            });

            // Drag and Drop
            li.addEventListener('dragstart', () => li.classList.add('dragging'));
            li.addEventListener('dragend', () => {
                li.classList.remove('dragging');
                updateTaskOrder();
            });

            taskList.appendChild(li);
        });

        updateProgress();
    }

    function addTask(text, deadline = '') {
        const newTask = {
            id: Date.now(),
            text: text,
            completed: false,
            deadline: deadline
        };
        tasks.push(newTask);
        saveTasks();
        renderTasks();
    }

    function toggleTask(id) {
        tasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
        saveTasks();
        renderTasks();
    }

    function updateTaskText(id, newText) {
        tasks = tasks.map(t => t.id === id ? { ...t, text: newText } : t);
        saveTasks();
        renderTasks();
    }

    function deleteTask(id) {
        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        renderTasks();
    }

    // AI Breakdown logic
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
        taskInput.disabled = true;
        btnAi.disabled = true;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Break down the following task into 3 to 5 very short, actionable subtasks. Return ONLY a valid JSON array of strings. No markdown, no backticks, no other text. Task: "${text}"`
                        }]
                    }]
                })
            });

            if (!response.ok) throw new Error("API Error");

            const data = await response.json();
            const responseText = data.candidates[0].content.parts[0].text;
            
            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const subtasks = JSON.parse(cleanJson);

            const parentId = Date.now();
            const date = taskDateInput ? taskDateInput.value : '';
            
            tasks.push({ id: parentId, text: text + ' (AI Planned)', completed: false, deadline: date });

            subtasks.forEach((sub, index) => {
                tasks.push({ id: parentId + index + 1, text: sub, completed: false, isSubtask: true });
            });

        } catch (error) {
            console.error(error);
            alert("Failed to generate subtasks. Please check your API key.");
        }

        saveTasks();
        renderTasks();
        
        taskInput.value = '';
        if (taskDateInput) taskDateInput.value = '';
        taskInput.disabled = false;
        btnAi.disabled = false;
        inputWrapper.classList.remove('ai-thinking');
        taskInput.focus();
    });

    // Form Submit
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = taskInput.value.trim();
        const date = taskDateInput ? taskDateInput.value : '';
        if (text) {
            addTask(text, date);
            taskInput.value = '';
            if (taskDateInput) taskDateInput.value = '';
        }
    });

    // Filters
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderTasks();
        });
    });

    // Drag and Drop Container Logic
    taskList.addEventListener('dragover', e => {
        e.preventDefault();
        if (currentFilter !== 'all') return;
        
        const afterElement = getDragAfterElement(taskList, e.clientY);
        const dragging = document.querySelector('.dragging');
        if (!dragging) return;
        
        if (afterElement == null) {
            taskList.appendChild(dragging);
        } else {
            taskList.insertBefore(dragging, afterElement);
        }
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function updateTaskOrder() {
        if (currentFilter !== 'all') return;
        const newOrderIds = [...taskList.querySelectorAll('.task-item')].map(li => Number(li.dataset.id));
        const reorderedTasks = [];
        newOrderIds.forEach(id => {
            const task = tasks.find(t => t.id === id);
            if (task) reorderedTasks.push(task);
        });
        tasks = reorderedTasks;
        saveTasks();
    }

    // Pomodoro Logic
    const pomodoroWidget = document.querySelector('.pomodoro-widget');
    const pomodoroTime = document.getElementById('pomodoro-time');
    const btnPomodoro = document.getElementById('btn-pomodoro');
    const pomodoroIcon = btnPomodoro ? btnPomodoro.querySelector('i') : null;
    
    let pomodoroInterval;
    let pomodoroSeconds = 25 * 60;
    let isPomodoroRunning = false;

    function updatePomodoroDisplay() {
        if(!pomodoroTime) return;
        const m = Math.floor(pomodoroSeconds / 60).toString().padStart(2, '0');
        const s = (pomodoroSeconds % 60).toString().padStart(2, '0');
        pomodoroTime.textContent = `${m}:${s}`;
    }

    if (btnPomodoro) {
        btnPomodoro.addEventListener('click', () => {
            if (isPomodoroRunning) {
                clearInterval(pomodoroInterval);
                isPomodoroRunning = false;
                pomodoroIcon.className = 'ph ph-play';
                pomodoroWidget.classList.remove('running');
            } else {
                isPomodoroRunning = true;
                pomodoroIcon.className = 'ph ph-pause';
                pomodoroWidget.classList.add('running');
                pomodoroInterval = setInterval(() => {
                    pomodoroSeconds--;
                    if (pomodoroSeconds < 0) {
                        clearInterval(pomodoroInterval);
                        pomodoroSeconds = 25 * 60;
                        isPomodoroRunning = false;
                        pomodoroIcon.className = 'ph ph-play';
                        pomodoroWidget.classList.remove('running');
                        alert("Pomodoro complete! Take a break.");
                    }
                    updatePomodoroDisplay();
                }, 1000);
            }
        });
        updatePomodoroDisplay();
    }

    // Settings Modal
    const settingsModal = document.getElementById('settings-modal');
    const btnSettings = document.getElementById('btn-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const apiKeyInput = document.getElementById('api-key-input');

    if (btnSettings) {
        btnSettings.addEventListener('click', () => {
            apiKeyInput.value = geminiApiKey;
            settingsModal.classList.remove('hidden');
        });
        btnCloseSettings.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
        btnSaveSettings.addEventListener('click', () => {
            geminiApiKey = apiKeyInput.value.trim();
            localStorage.setItem('gemini_api_key', geminiApiKey);
            settingsModal.classList.add('hidden');
        });
    }

    // Helper to prevent XSS
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    // Initial render
    renderTasks();
});
