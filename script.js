document.addEventListener('DOMContentLoaded', () => {
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const taskList = document.getElementById('task-list');
    const filterBtns = document.querySelectorAll('.filter-btn');

    let currentFilter = 'all';

    // Load tasks from LocalStorage or use dummy data if empty
    const savedTasks = localStorage.getItem('ai_tasks');
    let tasks = savedTasks ? JSON.parse(savedTasks) : [
        { id: 1, text: 'Brainstorm Phase 2 AI features', completed: false },
        { id: 2, text: 'Review initial design aesthetics', completed: true },
        { id: 3, text: 'Set up database schema', completed: false }
    ];

    function saveTasks() {
        localStorage.setItem('ai_tasks', JSON.stringify(tasks));
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
            return;
        }

        filteredTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''} ${task.isSubtask ? 'is-subtask' : ''}`;
            li.dataset.id = task.id;
            li.draggable = currentFilter === 'all';

            li.innerHTML = `
                <div class="task-content">
                    <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''}>
                    <span class="task-text">${escapeHTML(task.text)}</span>
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
    }

    function addTask(text) {
        const newTask = {
            id: Date.now(),
            text: text,
            completed: false
        };
        tasks.push(newTask);
        saveTasks();
        renderTasks();
    }

    function toggleTask(id) {
        tasks = tasks.map(t => 
            t.id === id ? { ...t, completed: !t.completed } : t
        );
        saveTasks();
        renderTasks();
    }

    function deleteTask(id) {
        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        renderTasks();
    }

    // AI Breakdown Simulation
    const btnAi = document.getElementById('btn-ai');
    const inputWrapper = document.querySelector('.input-wrapper');

    btnAi.addEventListener('click', async () => {
        const text = taskInput.value.trim();
        if (!text) return;

        // UI Loading State
        inputWrapper.classList.add('ai-thinking');
        taskInput.disabled = true;
        btnAi.disabled = true;

        // Simulate API Delay (2 seconds)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Create main task
        const parentId = Date.now();
        tasks.push({
            id: parentId,
            text: text + ' (AI Planned)',
            completed: false
        });

        // Create subtasks based on input
        const subtasks = [
            `Research best options for: ${text}`,
            `Draft an initial plan`,
            `Execute and review`
        ];

        subtasks.forEach((sub, index) => {
            tasks.push({
                id: parentId + index + 1,
                text: sub,
                completed: false,
                isSubtask: true
            });
        });

        // Reset UI State
        saveTasks();
        renderTasks();
        
        taskInput.value = '';
        taskInput.disabled = false;
        btnAi.disabled = false;
        inputWrapper.classList.remove('ai-thinking');
        taskInput.focus();
    });

    // Form Submit
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = taskInput.value.trim();
        if (text) {
            addTask(text);
            taskInput.value = '';
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
