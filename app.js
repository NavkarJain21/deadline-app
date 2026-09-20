const API_BASE = "https://deadline-app.onrender.com/api";

const state = {
    tasks: [],
    filter: "all",
    search: "",
    sort: "urgency",
    editingId: null,
};

const el = {
    taskList: document.querySelector("#taskList"),
    emptyState: document.querySelector("#emptyState"),
    template: document.querySelector("#taskTemplate"),
    dialog: document.querySelector("#taskDialog"),
    form: document.querySelector("#taskForm"),

    title: document.querySelector("#taskTitle"),
    date: document.querySelector("#taskDate"),
    time: document.querySelector("#taskTime"),
    priority: document.querySelector("#taskPriority"),
    notes: document.querySelector("#taskNotes"),

    dialogTitle: document.querySelector("#dialogTitle"),
    dialogEyebrow: document.querySelector("#dialogEyebrow"),
    saveText: document.querySelector("#saveText"),
    saveIcon: document.querySelector("#saveIcon"),

    viewTitle: document.querySelector("#viewTitle"),
    listSummary: document.querySelector("#listSummary"),

    search: document.querySelector("#searchInput"),
    sortButton: document.querySelector("#sortButton"),
    sortMenu: document.querySelector("#sortMenu"),

    toast: document.querySelector("#toast"),
};


// =========================
// API FUNCTIONS
// =========================

async function getTasks() {
    try {
        const response = await fetch(`${API_BASE}/deadlines`);

        if (!response.ok) {
            throw new Error("Failed to fetch deadlines");
        }

        state.tasks = await response.json();
        render();

    } catch (error) {
        console.error("Error loading deadlines:", error);
        showToast("Could not connect to the backend.");
    }
}


async function createTask(details) {
    try {
        const response = await fetch(`${API_BASE}/deadlines`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ...details,
                completed: false,
            }),
        });

        if (!response.ok) {
            throw new Error("Failed to create deadline");
        }

        const task = await response.json();

        state.tasks.push(task);

        closeTaskDialog();
        render();
        showToast("Deadline added to your list.");

    } catch (error) {
        console.error("Error creating deadline:", error);
        showToast("Could not save the deadline.");
    }
}


async function updateTask(id, details, completed) {
    try {
        const response = await fetch(`${API_BASE}/deadlines/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ...details,
                completed,
            }),
        });

        if (!response.ok) {
            throw new Error("Failed to update deadline");
        }

        const updatedTask = await response.json();

        const index = state.tasks.findIndex(
            (task) => String(task.id) === String(id)
        );

        if (index !== -1) {
            state.tasks[index] = updatedTask;
        }

        closeTaskDialog();
        render();
        showToast("Deadline updated.");

    } catch (error) {
        console.error("Error updating deadline:", error);
        showToast("Could not update the deadline.");
    }
}


async function deleteTask(id) {
    try {
        const response = await fetch(`${API_BASE}/deadlines/${id}`, {
            method: "DELETE",
        });

        if (!response.ok) {
            throw new Error("Failed to delete deadline");
        }

        state.tasks = state.tasks.filter(
            (task) => String(task.id) !== String(id)
        );

        render();
        showToast("Deadline removed.");

    } catch (error) {
        console.error("Error deleting deadline:", error);
        showToast("Could not delete the deadline.");
    }
}


// =========================
// DATE FUNCTIONS
// =========================

function localDate(date = new Date()) {
    const copy = new Date(date);

    copy.setMinutes(
        copy.getMinutes() - copy.getTimezoneOffset()
    );

    return copy.toISOString().slice(0, 10);
}


function startOfToday() {
    return new Date(`${localDate()}T00:00:00`);
}


function dayDifference(dateString) {
    return Math.round(
        (
            new Date(`${dateString}T00:00:00`) -
            startOfToday()
        ) / 86400000
    );
}


function taskDate(task) {
    return new Date(
        `${task.date}T${task.time || "23:59"}:00`
    );
}


function priorityRank(priority) {
    return {
        high: 0,
        medium: 1,
        low: 2,
    }[priority] ?? 3;
}


// =========================
// FILTER + SORT
// =========================

function visibleTasks() {
    const term = state.search.trim().toLowerCase();

    return state.tasks
        .filter((task) => {
            const days = dayDifference(task.date);

            const matchesFilter = {
                all: true,

                today:
                    !task.completed &&
                    days === 0,

                upcoming:
                    !task.completed &&
                    days > 0 &&
                    days <= 7,

                overdue:
                    !task.completed &&
                    days < 0,

                completed:
                    task.completed,

            }[state.filter];

            const matchesSearch =
                !term ||
                `${task.title} ${task.notes || ""}`
                    .toLowerCase()
                    .includes(term);

            return matchesFilter && matchesSearch;
        })
        .sort((a, b) => {

            if (state.sort === "date") {
                return taskDate(a) - taskDate(b);
            }

            if (state.sort === "priority") {
                return (
                    priorityRank(a.priority) -
                    priorityRank(b.priority)
                ) || (
                    taskDate(a) - taskDate(b)
                );
            }

            if (a.completed !== b.completed) {
                return Number(a.completed) - Number(b.completed);
            }

            const aStatus =
                dayDifference(a.date) < 0
                    ? -10
                    : dayDifference(a.date);

            const bStatus =
                dayDifference(b.date) < 0
                    ? -10
                    : dayDifference(b.date);

            return (
                aStatus - bStatus
            ) || (
                priorityRank(a.priority) -
                priorityRank(b.priority)
            ) || (
                taskDate(a) - taskDate(b)
            );
        });
}


// =========================
// DISPLAY HELPERS
// =========================

function dueText(task) {
    const days = dayDifference(task.date);

    if (days === 0) {
        return {
            label: "Due today",
            className: "today",
        };
    }

    if (days === -1) {
        return {
            label: "1 day overdue",
            className: "overdue",
        };
    }

    if (days < 0) {
        return {
            label: `${Math.abs(days)} days overdue`,
            className: "overdue",
        };
    }

    if (days === 1) {
        return {
            label: "Due tomorrow",
            className: "soon",
        };
    }

    if (days < 7) {
        return {
            label: `Due in ${days} days`,
            className: "soon",
        };
    }

    const date = new Date(`${task.date}T12:00:00`);

    return {
        label: `Due ${date.toLocaleDateString(
            undefined,
            {
                month: "short",
                day: "numeric",
            }
        )}`,
        className: "",
    };
}


function timeText(time) {
    if (!time) {
        return "";
    }

    return new Date(
        `1970-01-01T${time}:00`
    )
        .toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
        })
        .toLowerCase();
}


function count(tasks) {
    return tasks.filter(
        (task) => !task.completed
    ).length;
}


// =========================
// RENDER TASK
// =========================

function renderTask(task) {
    const fragment =
        el.template.content.cloneNode(true);

    const card =
        fragment.querySelector(".task-card");

    const complete =
        fragment.querySelector(".complete-toggle");

    const title =
        fragment.querySelector("h2");

    const notes =
        fragment.querySelector(".task-notes");

    const priority =
        fragment.querySelector(".priority-pill");

    const bar =
        fragment.querySelector(".priority-bar");

    const due =
        fragment.querySelector(".due-label");

    const time =
        fragment.querySelector(".time-label");

    const dueInfo = dueText(task);

    card.dataset.id = task.id;

    card.classList.toggle(
        "completed",
        task.completed
    );

    complete.setAttribute(
        "aria-label",
        task.completed
            ? "Mark incomplete"
            : "Mark complete"
    );

    title.textContent = task.title;

    notes.textContent =
        task.notes || "";

    priority.textContent =
        task.priority;

    priority.classList.add(
        task.priority
    );

    bar.classList.add(
        task.priority
    );

    due.textContent =
        dueInfo.label;

    if (dueInfo.className) {
        due.classList.add(
            dueInfo.className
        );
    }

    time.textContent =
        timeText(task.time);

    time.hidden =
        !task.time;

    complete.addEventListener(
        "click",
        () => toggleTask(task.id)
    );

    fragment
        .querySelector(".edit-task")
        .addEventListener(
            "click",
            () => openTaskDialog(task)
        );

    fragment
        .querySelector(".delete-task")
        .addEventListener(
            "click",
            () => removeTask(task.id)
        );

    return fragment;
}


// =========================
// MAIN RENDER
// =========================

function render() {
    const tasks = visibleTasks();

    el.taskList.replaceChildren(
        ...tasks.map(renderTask)
    );

    el.emptyState.hidden =
        tasks.length !== 0;

    const names = {
        all: "All deadlines",
        today: "Today",
        upcoming: "Next 7 days",
        overdue: "Overdue",
        completed: "Completed",
    };

    el.viewTitle.textContent =
        names[state.filter];

    const descriptions = {
        all:
            "Your deadlines, ordered by what needs attention first.",

        today:
            "A tight view of what needs to land before the day ends.",

        upcoming:
            "The next week, so you can make room early.",

        overdue:
            "A short list to bring back under control.",

        completed:
            "Finished work — a little proof of progress.",
    };

    el.listSummary.textContent =
        state.search
            ? `Results for “${state.search}”`
            : descriptions[state.filter];

    document
        .querySelectorAll(".filter")
        .forEach((button) => {
            button.classList.toggle(
                "active",
                button.dataset.filter ===
                    state.filter
            );
        });

    document.querySelector(
        "#allCount"
    ).textContent = count(state.tasks);

    document.querySelector(
        "#todayCount"
    ).textContent =
        state.tasks.filter(
            (task) =>
                !task.completed &&
                dayDifference(task.date) === 0
        ).length;

    document.querySelector(
        "#upcomingCount"
    ).textContent =
        state.tasks.filter(
            (task) =>
                !task.completed &&
                dayDifference(task.date) > 0 &&
                dayDifference(task.date) <= 7
        ).length;

    document.querySelector(
        "#overdueCount"
    ).textContent =
        state.tasks.filter(
            (task) =>
                !task.completed &&
                dayDifference(task.date) < 0
        ).length;

    document.querySelector(
        "#completedCount"
    ).textContent =
        state.tasks.filter(
            (task) => task.completed
        ).length;

    renderOverview();
}


// =========================
// DASHBOARD
// =========================

function renderOverview() {
    const open =
        state.tasks.filter(
            (task) => !task.completed
        );

    const today =
        open.filter(
            (task) =>
                dayDifference(task.date) === 0
        );

    const next =
        open
            .filter(
                (task) =>
                    dayDifference(task.date) >= 0
            )
            .sort(
                (a, b) =>
                    taskDate(a) -
                    taskDate(b)
            )[0];

    const completed =
        state.tasks.filter(
            (task) => task.completed
        ).length;

    const percentage =
        state.tasks.length
            ? Math.round(
                (completed /
                    state.tasks.length) *
                    100
            )
            : 0;

    const late =
        open.filter(
            (task) =>
                dayDifference(task.date) < 0
        );

    document.querySelector(
        "#todayStat"
    ).textContent = today.length;

    document.querySelector(
        "#todayStatCopy"
    ).textContent =
        today.length
            ? `${today.length === 1
                ? "One deadline"
                : `${today.length} deadlines`
              } to move forward.`
            : "A clear calendar.";

    document.querySelector(
        "#nextStat"
    ).textContent =
        next
            ? (
                dayDifference(next.date) === 0
                    ? "Today"
                    : dayDifference(next.date) === 1
                        ? "Tomorrow"
                        : `${dayDifference(next.date)}d`
            )
            : "—";

    document.querySelector(
        "#nextStatCopy"
    ).textContent =
        next
            ? next.title
            : "No upcoming deadline";

    document.querySelector(
        "#doneStat"
    ).textContent =
        `${percentage}%`;

    document.querySelector(
        "#doneStatCopy"
    ).textContent =
        completed
            ? `${completed} deadline${completed === 1 ? "" : "s"} complete`
            : "Keep the momentum going";

    document.querySelector(
        "#focusMetric"
    ).textContent =
        late.length
            ? `${late.length} overdue`
            : `${open.length} deadline${open.length === 1 ? "" : "s"}`;

    document.querySelector(
        "#focusCopy"
    ).textContent =
        late.length
            ? "Clear the overdue work first."
            : today.length
                ? "Start with today’s commitments."
                : "Nothing urgent right now.";

    document.querySelector(
        "#focusProgress"
    ).style.width =
        `${percentage}%`;
}


// =========================
// DIALOG
// =========================

function openTaskDialog(task = null) {
    state.editingId =
        task?.id || null;

    el.form.reset();

    el.dialogTitle.textContent =
        task
            ? "Edit deadline"
            : "New deadline";

    el.dialogEyebrow.textContent =
        task
            ? "MAKE IT CLEAR"
            : "PLAN AHEAD";

    el.saveText.textContent =
        task
            ? "Save changes"
            : "Add deadline";

    el.saveIcon.textContent =
        task
            ? "✓"
            : "+";

    el.title.value =
        task?.title || "";

    el.date.value =
        task?.date || localDate();

    el.time.value =
        task?.time || "";

    el.priority.value =
        task?.priority || "medium";

    el.notes.value =
        task?.notes || "";

    el.dialog.showModal();

    setTimeout(
        () => el.title.focus(),
        20
    );
}


function closeTaskDialog() {
    if (el.dialog.open) {
        el.dialog.close();
    }

    state.editingId = null;
}


// =========================
// COMPLETE / DELETE
// =========================

async function toggleTask(id) {
    const task =
        state.tasks.find(
            (item) =>
                String(item.id) ===
                String(id)
        );

    if (!task) {
        return;
    }

    const details = {
        title: task.title,
        date: task.date,
        time: task.time,
        priority: task.priority,
        notes: task.notes,
    };

    await updateTask(
        task.id,
        details,
        !task.completed
    );

    showToast(
        !task.completed
            ? "Deadline completed — nice work."
            : "Moved back to active deadlines."
    );
}


async function removeTask(id) {
    const task =
        state.tasks.find(
            (item) =>
                String(item.id) ===
                String(id)
        );

    if (
        !task ||
        !confirm(`Remove “${task.title}”?`)
    ) {
        return;
    }

    await deleteTask(id);
}


// =========================
// TOAST
// =========================

function showToast(message) {
    el.toast.textContent =
        message;

    el.toast.classList.add(
        "show"
    );

    clearTimeout(
        showToast.timeout
    );

    showToast.timeout =
        setTimeout(
            () =>
                el.toast.classList.remove(
                    "show"
                ),
            2600
        );
}


// =========================
// EVENT LISTENERS
// =========================

document.querySelector(
    "#dateLabel"
).textContent =
    new Date().toLocaleDateString(
        undefined,
        {
            weekday: "long",
            month: "long",
            day: "numeric",
        }
    );


document.querySelector(
    "#newTaskButton"
).addEventListener(
    "click",
    () => openTaskDialog()
);


document.querySelector(
    "#emptyAddButton"
).addEventListener(
    "click",
    () => openTaskDialog()
);


document.querySelector(
    "#closeDialog"
).addEventListener(
    "click",
    closeTaskDialog
);


document.querySelector(
    "#cancelDialog"
).addEventListener(
    "click",
    closeTaskDialog
);


document
    .querySelectorAll(".filter")
    .forEach(
        (button) =>
            button.addEventListener(
                "click",
                () => {
                    state.filter =
                        button.dataset.filter;

                    render();
                }
            )
    );


el.search.addEventListener(
    "input",
    () => {
        state.search =
            el.search.value;

        render();
    }
);


el.sortButton.addEventListener(
    "click",
    () => {
        el.sortMenu.hidden =
            !el.sortMenu.hidden;
    }
);


el.sortMenu.addEventListener(
    "click",
    (event) => {
        const button =
            event.target.closest(
                "button[data-sort]"
            );

        if (!button) {
            return;
        }

        state.sort =
            button.dataset.sort;

        el.sortButton
            .querySelector("span")
            .textContent =
            button.textContent;

        el.sortMenu
            .querySelectorAll("button")
            .forEach(
                (item) =>
                    item.classList.toggle(
                        "selected",
                        item === button
                    )
            );

        el.sortMenu.hidden =
            true;

        render();
    }
);


document.addEventListener(
    "click",
    (event) => {
        if (
            !event.target.closest(
                ".list-toolbar"
            )
        ) {
            el.sortMenu.hidden =
                true;
        }
    }
);


document.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "/" &&
            document.activeElement !==
                el.search &&
            document.activeElement.tagName !==
                "INPUT"
        ) {
            event.preventDefault();
            el.search.focus();
        }

        if (
            event.key.toLowerCase() === "n" &&
            !el.dialog.open &&
            ![
                "INPUT",
                "TEXTAREA",
                "SELECT",
            ].includes(
                document.activeElement.tagName
            )
        ) {
            event.preventDefault();
            openTaskDialog();
        }

        if (
            event.key === "Escape" &&
            el.dialog.open
        ) {
            closeTaskDialog();
        }
    }
);


// =========================
// FORM SUBMIT
// =========================

el.form.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        if (!el.form.reportValidity()) {
            return;
        }

        const details = {
            title:
                el.title.value.trim(),

            date:
                el.date.value,

            time:
                el.time.value,

            priority:
                el.priority.value,

            notes:
                el.notes.value.trim(),
        };

        if (state.editingId) {

            const task =
                state.tasks.find(
                    (item) =>
                        String(item.id) ===
                        String(state.editingId)
                );

            if (!task) {
                return;
            }

            await updateTask(
                state.editingId,
                details,
                task.completed
            );

        } else {

            await createTask(
                details
            );
        }
    }
);


// =========================
// INITIAL LOAD
// =========================

getTasks();