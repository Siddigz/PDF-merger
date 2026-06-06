from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pypdf import PdfReader, PdfWriter

MAX_UPLOAD_BYTES = 50 * 1024 * 1024

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="PDF Merger")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


def is_pdf(upload: UploadFile) -> bool:
    filename = upload.filename or ""
    content_type = upload.content_type or ""
    return filename.lower().endswith(".pdf") or content_type == "application/pdf"


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.post("/merge")
async def merge_pdfs(files: list[UploadFile] = File(...)):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least two PDF files are required.")

    writer = PdfWriter()
    total_size = 0

    for upload in files:
        if not is_pdf(upload):
            raise HTTPException(
                status_code=400,
                detail=f"Only PDF files are allowed. Rejected: {upload.filename or 'unknown'}",
            )

        data = await upload.read()
        total_size += len(data)

        if total_size > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"Total upload size exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
            )

        if not data:
            raise HTTPException(
                status_code=400,
                detail=f"File is empty: {upload.filename or 'unknown'}",
            )

        try:
            reader = PdfReader(BytesIO(data))
            for page in reader.pages:
                writer.add_page(page)
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Could not read PDF: {upload.filename or 'unknown'} ({exc})",
            ) from exc

    output = BytesIO()
    writer.write(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="merged.pdf"'},
    )
