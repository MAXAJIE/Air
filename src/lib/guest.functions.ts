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
      .single();

    const [{ data: amenities }, { data: items }, { data: qr }, { data: lastJob }] = await Promise.all([
      db.from("amenity_definitions").select("id, name, expected_qty").eq("property_id", data.propertyId),
      db
        .from("shopping_items")
        .select("id, name, price, description")
        .eq("owner_group_id", property!.owner_group_id)
        .eq("active", true),
      // QR bytes are encrypted at rest; the RPC decrypts for the service role.
      db.rpc("get_payment_qr", { p_group: property!.owner_group_id }),
      db
        .from("cleaning_jobs")
        .select("id, assigned_to_user_id, completed_at")
        .eq("property_id", data.propertyId)
        .not("assigned_to_user_id", "is", null)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const qrRow = (qr ?? null) as
      | { label: string | null; content_type: string; legacy_path: string | null; data_base64: string | null }
      | null;
    let qrUrl: string | null = null;
    if (qrRow?.data_base64) {
      qrUrl = `data:${qrRow.content_type};base64,${qrRow.data_base64}`;
    } else if (qrRow?.legacy_path) {
      const { data: signed } = await db.storage.from("photos").createSignedUrl(qrRow.legacy_path, 3600);
      qrUrl = signed?.signedUrl ?? null;
    }

    let cleaner: { jobId: string; userId: string; name: string } | null = null;
    if (lastJob?.assigned_to_user_id) {
      const { data: profile } = await db
        .from("profiles")
        .select("display_name, username")
        .eq("user_id", lastJob.assigned_to_user_id)
        .maybeSingle();
      cleaner = {
        jobId: lastJob.id,
        userId: lastJob.assigned_to_user_id,
        name: profile?.display_name || profile?.username || "Cleaner",
      };
    }

    return {
      propertyName: property!.name,
      amenities: amenities ?? [],
      catalog: (items ?? []).map((i) => ({ ...i, price: Number(i.price) })),
      qrUrl,
      qrLabel: qrRow?.label ?? null,
      cleaner,
    };
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
