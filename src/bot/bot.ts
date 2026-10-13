import { Bot, InlineKeyboard, type Context } from "grammy";
import type { ActivityService } from "../activities/service.js";
import type { Activity } from "../activities/types.js";
import type { ContactService } from "../contacts/service.js";
import type { ReminderService } from "../reminders/service.js";
import { formatActivity, formatActivityList } from "./format.js";
import { parseActivityText } from "./parser.js";

export interface BotServices {
  activities: ActivityService;
  reminders: ReminderService;
  now?: () => Date;
  timeZone?: string;
  miniAppUrl?: string;
  onOwnerSeen?: (ownerId: string) => void;
  contacts?: ContactService;
}

function ownerId(ctx: Context): string {
  if (!ctx.from) throw new Error("Telegram user identity is required.");
  return String(ctx.from.id);
}

function activityKeyboard(activity: Activity): InlineKeyboard {
  return new InlineKeyboard()
    .text("Complete", `activity:complete:${activity.id}`)
    .text("Cancel", `activity:cancel:${activity.id}`);
}

async function sendActivities(ctx: Context, title: string, activities: Activity[], timeZone: string) {
  await ctx.reply(formatActivityList(title, activities, timeZone));
}

export function createBot(token: string, services: BotServices): Bot {
  const bot = new Bot(token);
  const now = services.now ?? (() => new Date());
  const timeZone = services.timeZone ?? "Asia/Kolkata";
  const miniAppUrl = services.miniAppUrl ?? "http://localhost:3000/mini-app";
  const identifyOwner = (ctx: Context) => {
    const id = ownerId(ctx);
    services.onOwnerSeen?.(id);
    return id;
  };
  const dashboardKeyboard = miniAppUrl.startsWith("https://")
    ? new InlineKeyboard().webApp("Open dashboard", miniAppUrl)
    : new InlineKeyboard().text("Dashboard setup required", "dashboard:unavailable");

  const sendToday = async (ctx: Context) => {
    try {
      const owner = ownerId(ctx);
      const briefing = await services.reminders.briefing(owner, now());
      await sendActivities(ctx, "Today's activities", briefing.today, timeZone);
    } catch (error) {
      console.error("Could not load today's activities:", error);
      await ctx.reply("Could not load today's activities. Check the bot terminal for details.");
    }
  };

  const sendBriefing = async (ctx: Context) => {
    try {
      const briefing = await services.reminders.briefing(ownerId(ctx), now());
      await ctx.reply(
        `Daily briefing\n\nOverdue: ${briefing.overdue.length}\nToday: ${briefing.today.length}\nUpcoming: ${briefing.upcoming.length}\nNext: ${briefing.nextActivity?.title ?? "None"}`,
      );
    } catch (error) {
      console.error("Could not load daily briefing:", error);
      await ctx.reply("Could not load the briefing. Check the bot terminal for details.");
    }
  };

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Welcome to Loopify Owner Assistant.\n\nUse /add to create an activity, /today to view today, or /briefing for your daily summary.",
      { reply_markup: dashboardKeyboard },
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply("/add <activity>\n/today\n/upcoming\n/overdue\n/briefing\n/dashboard");
  });

  bot.command("add", async (ctx) => {
    try {
      const parsed = parseActivityText(ctx.match, now(), timeZone);
      const activity = await services.activities.create(ownerId(ctx), parsed);
      await services.reminders.scheduleDefault(identifyOwner(ctx), activity.id);
      await ctx.reply(`Please confirm:\n\n${formatActivity(activity, timeZone)}`, {
        reply_markup: activityKeyboard(activity),
      });
    } catch (error) {
      await ctx.reply(error instanceof Error ? error.message : "Could not create the activity.");
    }
  });

  bot.on("message:text", async (ctx) => {
    const command = ctx.message.text.trim().split(/\s+/, 1)[0].toLowerCase();
    if (command === "/today") {
      await sendToday(ctx);
      return;
    }
    if (command === "/briefing") {
      await sendBriefing(ctx);
      return;
    }
    if (ctx.message.text.startsWith("/")) return;
    try {
      const parsed = parseActivityText(ctx.message.text, now(), timeZone);
      const activity = await services.activities.create(ownerId(ctx), parsed);
      await services.reminders.scheduleDefault(identifyOwner(ctx), activity.id);
      await ctx.reply(`Please confirm:\n\n${formatActivity(activity, timeZone)}`, {
        reply_markup: activityKeyboard(activity),
      });
    } catch (error) {
      await ctx.reply(error instanceof Error ? error.message : "Could not understand that activity.");
    }
  });

  bot.command("today", async (ctx) => {
    await sendToday(ctx);
  });

  bot.command("upcoming", async (ctx) => {
    try {
      const briefing = await services.reminders.briefing(ownerId(ctx), now());
      await sendActivities(ctx, "Upcoming activities", briefing.upcoming, timeZone);
    } catch (error) {
      console.error("Could not load upcoming activities:", error);
      await ctx.reply("Could not load upcoming activities. Check the bot terminal for details.");
    }
  });

  bot.command("overdue", async (ctx) => {
    try {
      const briefing = await services.reminders.briefing(ownerId(ctx), now());
      await sendActivities(ctx, "Overdue activities", briefing.overdue, timeZone);
    } catch (error) {
      console.error("Could not load overdue activities:", error);
      await ctx.reply("Could not load overdue activities. Check the bot terminal for details.");
    }
  });

  bot.command("briefing", async (ctx) => {
    await sendBriefing(ctx);
  });

  bot.command("dashboard", async (ctx) => {
    if (!miniAppUrl.startsWith("https://")) {
      await ctx.reply("The dashboard needs a public HTTPS URL before it can open inside Telegram.");
      return;
    }
    await ctx.reply("Open your mobile dashboard:", { reply_markup: dashboardKeyboard });
  });

  bot.command("contacts", async (ctx) => {
    if (!services.contacts) {
      await ctx.reply("Contacts are not configured yet.");
      return;
    }
    const contacts = await services.contacts.list(ownerId(ctx), ctx.match || undefined);
    if (!contacts.length) {
      await ctx.reply("No contacts found.");
      return;
    }
    await ctx.reply(contacts.map((contact) =>
      `${contact.name}${contact.company ? ` (${contact.company})` : ""}\n${contact.relationship}`,
    ).join("\n\n"));
  });

  bot.on("callback_query:data", async (ctx) => {
    if (ctx.callbackQuery.data === "dashboard:unavailable") {
      await ctx.answerCallbackQuery({
        text: "Configure an HTTPS Mini App URL first.",
        show_alert: true,
      });
      return;
    }
    const match = ctx.callbackQuery.data.match(/^activity:(complete|cancel):(.+)$/);
    if (!match) {
      await ctx.answerCallbackQuery();
      return;
    }
    try {
      const activity = match[1] === "complete"
        ? await services.activities.complete(ownerId(ctx), match[2])
        : await services.activities.cancel(ownerId(ctx), match[2]);
      await ctx.answerCallbackQuery({ text: `Activity ${activity.status}.` });
      await ctx.editMessageText(formatActivity(activity, timeZone));
    } catch (error) {
      await ctx.answerCallbackQuery({ text: error instanceof Error ? error.message : "Action failed.", show_alert: true });
    }
  });

  bot.catch((error) => {
    console.error("Telegram update failed:", error.error);
  });

  return bot;
}
