const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const fileList = document.getElementById("file-list");
const fileListSection = document.getElementById("file-list-section");
const mergeBtn = document.getElementById("merge-btn");
const messageEl = document.getElementById("message");

/** @type {File[]} */
let files = [];
let dragSrcIndex = null;

function isPdf(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function showMessage(text, type = "") {
  messageEl.textContent = text;
  messageEl.className = type ? `message ${type}` : "message";
}

function updateMergeButton() {
  mergeBtn.disabled = files.length < 2;
}

function renderFileList() {
  fileList.innerHTML = "";

  if (files.length === 0) {
    fileListSection.classList.add("hidden");
    updateMergeButton();
    return;
  }

  fileListSection.classList.remove("hidden");

  files.forEach((file, index) => {
    const li = document.createElement("li");
    li.className = "file-item";
    li.draggable = true;
    li.dataset.index = String(index);

    li.innerHTML = `
      <span class="drag-handle" aria-hidden="true">&#9776;</span>
      <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
      <button type="button" class="remove-btn" aria-label="Remove ${escapeHtml(file.name)}">Remove</button>
    `;

    li.addEventListener("dragstart", onDragStart);
    li.addEventListener("dragend", onDragEnd);
    li.addEventListener("dragover", onDragOver);
    li.addEventListener("dragleave", onDragLeave);
    li.addEventListener("drop", onDrop);

    li.querySelector(".remove-btn").addEventListener("click", () => {
      files.splice(index, 1);
      renderFileList();
    });

    fileList.appendChild(li);
  });

  updateMergeButton();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function addFiles(newFiles) {
  const pdfs = [];
  const rejected = [];

  for (const file of newFiles) {
    if (isPdf(file)) {
      pdfs.push(file);
    } else {
      rejected.push(file.name);
    }
  }

  if (rejected.length > 0) {
    showMessage(`Skipped non-PDF files: ${rejected.join(", ")}`, "error");
  } else if (pdfs.length > 0) {
    showMessage("");
  }

  files.push(...pdfs);
  renderFileList();
}

function onDragStart(e) {
  dragSrcIndex = Number(e.currentTarget.dataset.index);
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function onDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".file-item.drag-over").forEach((el) => {
    el.classList.remove("drag-over");
  });
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  e.currentTarget.classList.add("drag-over");
}

function onDragLeave(e) {
  e.currentTarget.classList.remove("drag-over");
}

function onDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const targetIndex = Number(e.currentTarget.dataset.index);
  e.currentTarget.classList.remove("drag-over");

  if (dragSrcIndex === null || dragSrcIndex === targetIndex) {
    return;
  }

  const [moved] = files.splice(dragSrcIndex, 1);
  files.splice(targetIndex, 0, moved);
  dragSrcIndex = null;
  renderFileList();
}

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  addFiles([...e.dataTransfer.files]);
});

fileInput.addEventListener("change", () => {
  addFiles([...fileInput.files]);
  fileInput.value = "";
});

mergeBtn.addEventListener("click", async () => {
  if (files.length < 2) {
    return;
  }

  showMessage("");
  mergeBtn.classList.add("loading");
  mergeBtn.disabled = true;
  mergeBtn.textContent = "Merging…";

  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file, file.name);
  }

  try {
    const response = await fetch("/merge", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let detail = "Merge failed.";
      try {
        const body = await response.json();
        detail = body.detail || detail;
      } catch {
        // ignore JSON parse errors
      }
      showMessage(detail, "error");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "merged.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showMessage("Download started.", "success");
  } catch {
    showMessage("Network error. Is the server running?", "error");
  } finally {
    mergeBtn.classList.remove("loading");
    mergeBtn.textContent = "Merge PDFs";
    updateMergeButton();
  }
});

renderFileList();
