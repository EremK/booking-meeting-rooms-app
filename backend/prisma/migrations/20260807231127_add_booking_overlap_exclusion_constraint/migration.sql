-- Race-condition protection (BONUS-4): reject overlapping bookings for the
-- same room atomically at the database level, so two concurrent inserts for
-- the same slot can never both succeed -- no application-level locking code.
--
-- Range bounds are [start, end): back-to-back bookings (10:00-11:00 and
-- 11:00-12:00) share a boundary but do not overlap, matching BOOK-7.
-- The WHERE clause scopes the constraint to active bookings only, so a
-- cancelled booking's slot is free again for others to book.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "roomId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("cancelledAt" IS NULL);
