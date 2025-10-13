import asyncio

from ..schemas import BatchUploadItem, BatchUploadResponse
from ..utils.batch_progress import BatchProgressTracker


def test_batch_progress_tracker_records_and_streams_events():
    asyncio.run(_exercise_tracker())


async def _exercise_tracker() -> None:
    tracker = BatchProgressTracker()
    batch_id = "batch-123"
    initial_items = [
        BatchUploadItem(upload_id=f"{batch_id}:0", filename="first.csv", status="queued"),
        BatchUploadItem(upload_id=f"{batch_id}:1", filename="second.csv", status="queued"),
    ]

    await tracker.start_batch(batch_id, initial_items)

    stream = tracker.stream(batch_id)
    snapshot_event = await asyncio.wait_for(stream.__anext__(), timeout=1)
    assert snapshot_event.event == "batch-snapshot"
    assert snapshot_event.summary.status == "processing"

    await tracker.update_item(batch_id, f"{batch_id}:0", status="processing", filename="first.csv")
    progress_event = await asyncio.wait_for(stream.__anext__(), timeout=1)
    assert progress_event.event == "item-progress"
    assert progress_event.item.status == "processing"

    await tracker.update_item(
        batch_id,
        f"{batch_id}:0",
        status="success",
        filename="first.csv",
        file_url="file-1",
    )
    success_event = await asyncio.wait_for(stream.__anext__(), timeout=1)
    assert success_event.event == "item-complete"
    assert success_event.item.status == "success"

    await tracker.update_item(
        batch_id,
        f"{batch_id}:1",
        status="failed",
        filename="second.csv",
        error="boom",
    )
    failure_event = await asyncio.wait_for(stream.__anext__(), timeout=1)
    assert failure_event.event == "item-complete"
    assert failure_event.item.status == "failed"

    final_payload = BatchUploadResponse(
        batch_id=batch_id,
        status="partial",
        items=[
            BatchUploadItem(
                upload_id=f"{batch_id}:0",
                filename="first.csv",
                status="success",
                file_url="file-1",
            ),
            BatchUploadItem(
                upload_id=f"{batch_id}:1",
                filename="second.csv",
                status="failed",
                error="boom",
            ),
        ],
    )

    await tracker.finish_batch(batch_id, final_payload)
    complete_event = await asyncio.wait_for(stream.__anext__(), timeout=1)
    assert complete_event.event == "batch-complete"

    try:
        await asyncio.wait_for(stream.__anext__(), timeout=1)
    except StopAsyncIteration:
        pass
    else:  # pragma: no cover - defensive guard
        raise AssertionError("stream should be exhausted after batch completion")

    snapshot = await tracker.get_snapshot(batch_id)
    assert snapshot.status == "partial"
    assert [item.status for item in snapshot.items] == ["success", "failed"]
