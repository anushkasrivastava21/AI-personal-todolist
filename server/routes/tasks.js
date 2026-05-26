const express = require('express');
const prisma = require('../prisma/client');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Apply auth middleware to all task routes
router.use(authMiddleware);

// Helper function to check if priority is valid
const isValidPriority = (p) => ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(p);

// Helper function to check if status is valid
const isValidStatus = (s) => ['TODO', 'IN_PROGRESS', 'DONE'].includes(s);

// @route   GET /api/tasks
// @desc    Get all tasks for user (optionally filtered by workspace, status, or date)
router.get('/', async (req, res) => {
  const { workspaceId, status, date } = req.query;
  const userId = req.user.id;

  const whereClause = { userId };

  if (workspaceId) {
    whereClause.workspaceId = workspaceId;
  }

  if (status && isValidStatus(status)) {
    whereClause.status = status;
  }

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    whereClause.OR = [
      {
        scheduledDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      {
        deadline: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    ];
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        ...whereClause,
        parentTaskId: null, // Only fetch parent tasks; subtasks will be nested inside
      },
      include: {
        subtasks: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    res.json(tasks);
  } catch (err) {
    console.error('Fetch tasks error:', err);
    res.status(500).json({ error: 'Server error fetching tasks' });
  }
});

// @route   GET /api/tasks/:id
// @desc    Get a single task by ID
router.get('/:id', async (req, res) => {
  const userId = req.user.id;

  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        subtasks: true,
      },
    });

    if (!task || task.userId !== userId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (err) {
    console.error('Fetch task detail error:', err);
    res.status(500).json({ error: 'Server error fetching task' });
  }
});

// @route   POST /api/tasks
// @desc    Create a new task or subtask
router.post('/', async (req, res) => {
  const userId = req.user.id;
  const {
    title,
    description,
    priority,
    status,
    workspaceId,
    parentTaskId,
    scheduledDate,
    deadline,
    eisenhowerQuadrant,
    estimatedPomodoros,
    isAiGenerated,
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    // 1. Verify workspace exists and belongs to user
    let targetWorkspaceId = workspaceId;
    if (!targetWorkspaceId) {
      // Fallback to default workspace
      const defaultWorkspace = await prisma.workspace.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (!defaultWorkspace) {
        return res.status(400).json({ error: 'No workspace found for this user' });
      }
      targetWorkspaceId = defaultWorkspace.id;
    } else {
      const workspace = await prisma.workspace.findUnique({
        where: { id: targetWorkspaceId },
      });
      if (!workspace || workspace.userId !== userId) {
        return res.status(400).json({ error: 'Invalid workspace ID' });
      }
    }

    // 2. If it is a subtask, verify parent task exists
    if (parentTaskId) {
      const parentTask = await prisma.task.findUnique({
        where: { id: parentTaskId },
      });
      if (!parentTask || parentTask.userId !== userId) {
        return res.status(400).json({ error: 'Invalid parent task ID' });
      }
    }

    // 3. Build data payload
    const taskData = {
      userId,
      workspaceId: targetWorkspaceId,
      parentTaskId: parentTaskId || null,
      title,
      description: description || null,
      priority: priority && isValidPriority(priority) ? priority : 'MEDIUM',
      status: status && isValidStatus(status) ? status : 'TODO',
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      deadline: deadline ? new Date(deadline) : null,
      eisenhowerQuadrant: eisenhowerQuadrant ? parseInt(eisenhowerQuadrant) : null,
      estimatedPomodoros: estimatedPomodoros ? parseInt(estimatedPomodoros) : 1,
      completedPomodoros: 0,
      isAiGenerated: !!isAiGenerated,
    };

    const newTask = await prisma.task.create({
      data: taskData,
      include: {
        subtasks: true,
      },
    });

    res.status(201).json(newTask);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Server error creating task' });
  }
});

// @route   PUT /api/tasks/:id
// @desc    Update a task properties
router.put('/:id', async (req, res) => {
  const userId = req.user.id;
  const {
    title,
    description,
    priority,
    status,
    workspaceId,
    parentTaskId,
    scheduledDate,
    deadline,
    eisenhowerQuadrant,
    estimatedPomodoros,
    completedPomodoros,
  } = req.body;

  try {
    const existingTask = await prisma.task.findUnique({
      where: { id: req.params.id },
    });

    if (!existingTask || existingTask.userId !== userId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Build update object
    const updateData = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority && isValidPriority(priority)) updateData.priority = priority;
    if (status && isValidStatus(status)) updateData.status = status;
    if (workspaceId) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
      });
      if (workspace && workspace.userId === userId) {
        updateData.workspaceId = workspaceId;
      }
    }
    if (parentTaskId !== undefined) updateData.parentTaskId = parentTaskId;
    if (scheduledDate !== undefined) updateData.scheduledDate = scheduledDate ? new Date(scheduledDate) : null;
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (eisenhowerQuadrant !== undefined) updateData.eisenhowerQuadrant = eisenhowerQuadrant ? parseInt(eisenhowerQuadrant) : null;
    if (estimatedPomodoros !== undefined) updateData.estimatedPomodoros = parseInt(estimatedPomodoros);
    if (completedPomodoros !== undefined) updateData.completedPomodoros = parseInt(completedPomodoros);

    const updatedTask = await prisma.task.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        subtasks: true,
      },
    });

    // Side effect: If a parent task is updated to DONE, complete all subtasks
    if (status === 'DONE' && !existingTask.parentTaskId) {
      await prisma.task.updateMany({
        where: { parentTaskId: req.params.id },
        data: { status: 'DONE' },
      });
    }

    // Side effect: If all subtasks of a parent are completed, auto-complete parent
    if (status === 'DONE' && existingTask.parentTaskId) {
      const parentId = existingTask.parentTaskId;
      const incompleteSiblings = await prisma.task.findMany({
        where: {
          parentTaskId: parentId,
          status: { not: 'DONE' },
          id: { not: req.params.id } // Excluding the one we just set to DONE
        },
      });

      if (incompleteSiblings.length === 0) {
        await prisma.task.update({
          where: { id: parentId },
          data: { status: 'DONE' },
        });
      }
    }

    res.json(updatedTask);
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Server error updating task' });
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete a task (cascades to subtasks)
router.delete('/:id', async (req, res) => {
  const userId = req.user.id;

  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
    });

    if (!task || task.userId !== userId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await prisma.task.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Server error deleting task' });
  }
});

module.exports = router;
