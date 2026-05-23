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
            li.className = `task-item ${task.completed ? 'completed' : ''}`;
            li.dataset.id = task.id;

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
