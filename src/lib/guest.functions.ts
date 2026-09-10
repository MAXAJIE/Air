import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { admin, requireSession, uploadGuestPhoto, uuid } from "@/lib/guest-internal";

/**
 * Guest (no-login) flows. Guests never touch the database directly: every call
 * here re-validates the stay code / session against the property before writing.
 */

/** Public property header shown before the stay code is entered. */
export const getGuestProperty = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ propertyId: uuid }).parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: property, error } = await db
      .from("properties")
      .select("id, name")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return property ? { id: property.id, name: property.name } : null;
  });

/** Exchanges the stay code for a lightweight guest session. */
export const startGuestSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ propertyId: uuid, code: z.string().min(1).max(40) }).parse(input),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: property, error } = await db
      .from("properties")
      .select("id, name, access_code, owner_group_id")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!property?.access_code) throw new Error("bad_code");
    if (property.access_code.trim().toLowerCase() !== data.code.trim().toLowerCase()) {
      throw new Error("bad_code");
    }
    const { data: session, error: sessionError } = await db
      .from("customer_sessions")
      .insert({ property_id: property.id, room_code: property.access_code })
      .select("id, expires_at")
      .single();
    if (sessionError) throw new Error(sessionError.message);
    return { sessionId: session.id, expiresAt: session.expires_at, propertyName: property.name };
  });

/** Everything a guest needs: amenities, catalog, payment QR, latest cleaner. */
export const getGuestContext = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ propertyId: uuid, sessionId: uuid }).parse(input))
  .handler(async ({ data }) => {
    await requireSession(data.sessionId, data.propertyId);
    const db = await admin();

    const { data: property } = await db
      .from("properties")
      .select("id, name, owner_group_id")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (!property) throw new Error("bad_code");

    // The room page must render even when an optional extra (payment QR,
    // last cleaner, a signed photo) is unavailable, so each is best-effort.
    const safe = async <T,>(run: () => Promise<T>): Promise<T | null> => {
      try {
        return await run();
      } catch {
        return null;
      }
    };

    const [amenities, items, qr, lastJob] = await Promise.all([
      safe(async () =>
        (await db.from("amenity_definitions").select("id, name, expected_qty").eq("property_id", data.propertyId)).data,
      ),
      safe(async () =>
        (
          await db
            .from("shopping_items")
            .select("id, name, price, description, photo_path")
            .eq("owner_group_id", property.owner_group_id)
            .eq("active", true)
        ).data,
      ),
      // QR bytes are encrypted at rest; the RPC decrypts for the service role.
      safe(async () => (await db.rpc("get_payment_qr", { p_group: property.owner_group_id })).data),
      safe(async () =>
        (
          await db
            .from("cleaning_jobs")
            .select("id, assigned_to_user_id, completed_at")
            .eq("property_id", data.propertyId)
            .not("assigned_to_user_id", "is", null)
            .not("completed_at", "is", null)
            .order("completed_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data,
      ),
    ]);

    const qrRow = (qr ?? null) as
      | { label: string | null; content_type: string; legacy_path: string | null; data_base64: string | null }
      | null;
    let qrUrl: string | null = null;
    if (qrRow?.data_base64) {
      qrUrl = `data:${qrRow.content_type};base64,${qrRow.data_base64}`;
    } else if (qrRow?.legacy_path) {
      const signed = await safe(async () =>
        (await db.storage.from("photos").createSignedUrl(qrRow.legacy_path!, 3600)).data,
      );
      qrUrl = signed?.signedUrl ?? null;
    }

    let cleaner: { jobId: string; userId: string; name: string } | null = null;
    if (lastJob?.assigned_to_user_id) {
      const profile = await safe(async () =>
        (
          await db
            .from("profiles")
            .select("display_name, username")
            .eq("user_id", lastJob.assigned_to_user_id!)
            .maybeSingle()
        ).data,
      );
      cleaner = {
        jobId: lastJob.id,
        userId: lastJob.assigned_to_user_id,
        name: profile?.display_name || profile?.username || "Cleaner",
      };
    }

    return {
      propertyName: property.name,
      amenities: amenities ?? [],
      catalog: await Promise.all(
        (items ?? []).map(async (i) => {
          // Sign the item photo so the guest (anonymous, no auth) can render it.
          let photoUrl: string | null = null;
          if (i.photo_path) {
            const signed = await safe(async () =>
              (await db.storage.from("photos").createSignedUrl(i.photo_path!, 3600)).data,
            );
            photoUrl = signed?.signedUrl ?? null;
          }
          return {
            id: i.id,
            name: i.name,
            description: i.description,
            price: Number(i.price),
            photoUrl,
          };
        }),
      ),
      qrUrl,
      qrLabel: qrRow?.label ?? null,
      cleaner,
    };
  });

/** Check-in details captured by the guest welcome checklist. */
export const saveGuestCheckIn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: uuid,
        sessionId: uuid,
        guestName: z.string().min(1).max(120),
        partySize: z.number().int().min(1).max(50),
        checkInAt: z.string().min(1).max(40),
        contactNumber: z.string().min(3).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireSession(data.sessionId, data.propertyId);
    const when = new Date(data.checkInAt);
    if (Number.isNaN(when.getTime())) throw new Error("Invalid check-in time");

    const db = await admin();
    const { error } = await db
      .from("customer_sessions")
      .update({
        guest_name: data.guestName,
        party_size: data.partySize,
        check_in_at: when.toISOString(),
        contact_number: data.contactNumber,
      })
      .eq("id", data.sessionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Everything this stay has submitted so far, newest first. */
export const getGuestActivity = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ propertyId: uuid, sessionId: uuid, sessionIds: z.array(uuid).max(50).optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireSession(data.sessionId, data.propertyId);
    const db = await admin();

    // Past sessions of the same device are included so a checkout does not
    // wipe the guest's history. Each id is re-checked against the property.
    const requested = Array.from(new Set([data.sessionId, ...(data.sessionIds ?? [])]));
    const { data: owned, error: ownedError } = await db
      .from("customer_sessions")
      .select("id")
      .eq("property_id", data.propertyId)
      .in("id", requested);
    if (ownedError) throw new Error(ownedError.message);
    const sessionIds = (owned ?? []).map((row) => row.id);

    const [reviews, requests, orders] = await Promise.all([
      db
        .from("room_condition_submissions")
        .select("id, overall_rating, notes, complaint, submitted_at")
        .in("customer_session_id", sessionIds),
      db
        .from("special_requests")
        .select("id, description, status, created_at")
        .in("customer_session_id", sessionIds),
      db
        .from("shopping_orders")
        .select("id, total_amount, status, created_at")
        .in("customer_session_id", sessionIds),
    ]);
    for (const result of [reviews, requests, orders]) {
      if (result.error) throw new Error(result.error.message);
    }

    const entries = [
      ...(reviews.data ?? []).map((row) => ({
        id: `review-${row.id}`,
        kind: "review" as const,
        title: row.overall_rating ? `${row.overall_rating}/5` : "—",
        detail: row.complaint || row.notes || "",
        at: row.submitted_at as string,
      })),
      ...(requests.data ?? []).map((row) => ({
        id: `request-${row.id}`,
        kind: "request" as const,
        title: row.status as string,
        detail: row.description as string,
        at: row.created_at as string,
      })),
      ...(orders.data ?? []).map((row) => ({
        id: `order-${row.id}`,
        kind: "order" as const,
        title: row.status as string,
        detail: String(row.total_amount),
        at: row.created_at as string,
      })),
    ];

    return { entries: entries.sort((a, b) => b.at.localeCompare(a.at)) };
  });

/**
 * Check out. The owner keeps the closed session as the record of the stay and
 * the device gets a fresh session for anything it does next; the guest's own
 * history still lists the closed sessions.
 */
export const checkoutGuestSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ propertyId: uuid, sessionId: uuid }).parse(input))
  .handler(async ({ data }) => {
    await requireSession(data.sessionId, data.propertyId);
    const db = await admin();

    const { error } = await db
      .from("customer_sessions")
      .update({ checked_out_at: new Date().toISOString() })
      .eq("id", data.sessionId);
    if (error) throw new Error(error.message);

    const { data: property, error: propError } = await db
      .from("properties")
      .select("access_code")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (propError) throw new Error(propError.message);
    if (!property?.access_code) throw new Error("Property is no longer available");

    const { data: session, error: newError } = await db
      .from("customer_sessions")
      .insert({ property_id: data.propertyId, room_code: property.access_code })
      .select("id")
      .single();
    if (newError) throw new Error(newError.message);

    return { sessionId: session.id };
  });

/** Room condition: amenity counts (no photo required) + rating + hygiene photos. */
export const submitRoomCondition = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: uuid,
        sessionId: uuid,
        rating: z.number().int().min(1).max(5).nullable(),
        notes: z.string().max(2000).optional(),
        complaint: z.string().max(2000).optional(),
        counts: z.array(z.object({ amenityId: uuid, actualQty: z.number().int().min(0).max(9999) })).max(60),
        photos: z
          .array(
            z.object({
              fileName: z.string().max(120),
              contentType: z.string().max(80),
              dataBase64: z.string().max(12_000_000),
            }),
          )
          .max(5)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireSession(data.sessionId, data.propertyId);
    const db = await admin();

    const { data: submission, error } = await db
      .from("room_condition_submissions")
      .insert({
        property_id: data.propertyId,
        customer_session_id: data.sessionId,
        overall_rating: data.rating,
        notes: data.notes ?? null,
        complaint: data.complaint ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    for (const photo of data.photos ?? []) {
      const path = await uploadGuestPhoto(data.propertyId, photo.fileName, photo.contentType, photo.dataBase64);
      await db.from("room_condition_photos").insert({ submission_id: submission.id, photo_url: path });
    }

    if (data.counts.length > 0) {
      await db.from("amenity_checks").insert(
        data.counts.map((c) => ({
          amenity_definition_id: c.amenityId,
          property_id: data.propertyId,
          role: "customer" as const,
          customer_session_id: data.sessionId,
          actual_qty: c.actualQty,
        })),
      );
    }
    return { ok: true };
  });

/**
 * Arrival amenities checklist.
 *
 * Right after check-in the guest confirms, item by item, that the promised
 * amenities are actually in the room. Each answer is stored as an
 * `amenity_checks` row with role "customer", which is the same table the owner
 * and the cleaner write to — so the owner sees the guest's answers (and any
 * shortfall notification) without a separate sync step.
 */
export const saveGuestAmenityCheck = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: uuid,
        sessionId: uuid,
        entries: z
          .array(
            z.object({
              amenityId: uuid,
              actualQty: z.number().int().min(0).max(9999),
              note: z.string().max(500).optional(),
            }),
          )
          .min(1)
          .max(60),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireSession(data.sessionId, data.propertyId);
    const db = await admin();

    const { error } = await db.from("amenity_checks").insert(
      data.entries.map((entry) => ({
        amenity_definition_id: entry.amenityId,
        property_id: data.propertyId,
        role: "customer" as const,
        customer_session_id: data.sessionId,
        actual_qty: entry.actualQty,
        // Trimmed to null so an empty box does not store an empty string.
        notes: entry.note?.trim() ? entry.note.trim() : null,
      })),
    );
    if (error) throw new Error(error.message);

    // The is_discrepancy flag and the owner notification are handled by the
    // existing database triggers on amenity_checks.
    return { ok: true, saved: data.entries.length };
  });

/** Guests rate the cleaner — never the owner. */
export const rateCleaner = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: uuid,
        sessionId: uuid,
        cleanerUserId: uuid,
        jobId: uuid.nullable(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireSession(data.sessionId, data.propertyId);
    const db = await admin();
    const { error } = await db.from("cleaner_ratings").insert({
      property_id: data.propertyId,
      customer_session_id: data.sessionId,
      cleaner_user_id: data.cleanerUserId,
      cleaning_job_id: data.jobId,
      rating: data.rating,
      comment: data.comment ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Free-text request straight to the owner. No price, no payment. */
export const createSpecialRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ propertyId: uuid, sessionId: uuid, description: z.string().min(3).max(2000) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireSession(data.sessionId, data.propertyId);
    const db = await admin();
    const { error } = await db.from("special_requests").insert({
      property_id: data.propertyId,
      customer_session_id: data.sessionId,
      description: data.description,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Shopping order. The total is computed server-side from catalog prices; the
 * guest-entered amount is a self-reported number for the owner to eyeball
 * against the uploaded proof photo. Nothing here verifies a payment.
 */
export const createShoppingOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        propertyId: uuid,
        sessionId: uuid,
        lines: z.array(z.object({ itemId: uuid, quantity: z.number().int().min(1).max(99) })).min(1).max(40),
        amountEntered: z.number().min(0).max(1_000_000),
        proof: z.object({
          fileName: z.string().max(120),
          contentType: z.string().max(80),
          dataBase64: z.string().max(12_000_000),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireSession(data.sessionId, data.propertyId);
    const db = await admin();

    const { data: property } = await db
      .from("properties")
      .select("owner_group_id")
      .eq("id", data.propertyId)
      .single();
    const { data: catalog, error: catalogError } = await db
      .from("shopping_items")
      .select("id, name, price")
      .eq("owner_group_id", property!.owner_group_id)
      .in(
        "id",
        data.lines.map((l) => l.itemId),
      );
    if (catalogError) throw new Error(catalogError.message);
    if (!catalog || catalog.length === 0) throw new Error("No valid items in order");

    const priced = data.lines
      .map((line) => {
        const item = catalog.find((c) => c.id === line.itemId);
        return item ? { line, item } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const total = priced.reduce((sum, p) => sum + Number(p.item.price) * p.line.quantity, 0);

    const { data: order, error } = await db
      .from("shopping_orders")
      .insert({
        property_id: data.propertyId,
        customer_session_id: data.sessionId,
        total_amount: total,
        status: "pending_payment",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await db.from("shopping_order_items").insert(
      priced.map((p) => ({
        order_id: order.id,
        shopping_item_id: p.item.id,
        name_snapshot: p.item.name,
        quantity: p.line.quantity,
        unit_price_snapshot: Number(p.item.price),
      })),
    );

    const proofPath = await uploadGuestPhoto(
      data.propertyId,
      data.proof.fileName,
      data.proof.contentType,
      data.proof.dataBase64,
    );

    await db
      .from("shopping_orders")
      .update({
        payment_proof_photo_url: proofPath,
        payment_proof_amount_entered: data.amountEntered,
        status: "proof_submitted",
      })
      .eq("id", order.id);

    return { orderId: order.id, total };
  });
