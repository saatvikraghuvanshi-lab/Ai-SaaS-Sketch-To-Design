import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const projectPatch = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  styleGuide: v.optional(v.string()),
  sketchesData: v.optional(v.any()),
  viewportData: v.optional(v.any()),
  generatedDesignData: v.optional(v.any()),
  thumbnail: v.optional(v.string()),
  moodBoardImages: v.optional(v.array(v.string())),
  inspirationImages: v.optional(v.array(v.string())),
  isPublic: v.optional(v.boolean()),
  tags: v.optional(v.array(v.string())),
});

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    throw new Error("You must be signed in.");
  }

  return userId;
}

async function nextProjectNumber(ctx: MutationCtx, userId: NonNullable<Awaited<ReturnType<typeof getAuthUserId>>>) {
  const counter = await ctx.db
    .query("project_counters")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  if (!counter) {
    await ctx.db.insert("project_counters", {
      userId,
      nextProjectNumber: 2,
    });
    return 1;
  }

  const projectNumber = counter.nextProjectNumber;
  await ctx.db.patch(counter._id, {
    nextProjectNumber: projectNumber + 1,
  });

  return projectNumber;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return [];
    }

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    return projects.sort((a, b) => b.lastModified - a.lastModified);
  },
});

export const get = query({
  args: {
    id: v.id("projects"),
  },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return null;
    }

    const project = await ctx.db.get(id);

    if (!project || project.userId !== userId) {
      return null;
    }

    return project;
  },
});

export const create = mutation({
  args: {
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { name, description }) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const projectNumber = await nextProjectNumber(ctx, userId);

    return await ctx.db.insert("projects", {
      userId,
      name: name?.trim() || `Project ${projectNumber}`,
      description,
      sketchesData: {},
      viewportData: {},
      moodBoardImages: [],
      inspirationImages: [],
      lastModified: now,
      createdAt: now,
      isPublic: false,
      tags: [],
      projectNumber,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("projects"),
    patch: projectPatch,
  },
  handler: async (ctx, { id, patch }) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(id);

    if (!project || project.userId !== userId) {
      throw new Error("Project not found.");
    }

    await ctx.db.patch(id, {
      ...withoutUndefined(patch),
      lastModified: Date.now(),
    });
  },
});

export const generateMoodboardUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const resolveMoodboardImage = query({
  args: {
    storageId: v.string(),
  },
  handler: async (ctx, { storageId }) => {
    await requireUserId(ctx);
    return await ctx.storage.getUrl(storageId);
  },
});
export const remove = mutation({
  args: {
    id: v.id("projects"),
  },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get(id);

    if (!project || project.userId !== userId) {
      throw new Error("Project not found.");
    }

    await ctx.db.delete(id);
  },
});