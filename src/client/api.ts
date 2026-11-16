import type { BoardView, Idea, IdeaPatch, Person, SchoolHolidaysResponse, Settings, Space } from "../shared/types";

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status}).`);
  return data as T;
}

const board = (year: number) => `/api/boards/${year}`;

export const api = {
  years: () => request<number[]>("GET", "/api/years"),
  addYear: (year: number) => request("POST", "/api/years", { year }),
  removeYear: (year: number) => request("DELETE", `/api/years/${year}`),

  board: (year: number) => request<BoardView>("GET", board(year)),
  addSpace: (year: number, name: string) => request<Space>("POST", `${board(year)}/spaces`, { name }),
  renameSpace: (year: number, spaceId: string, name: string) =>
    request("PATCH", `${board(year)}/spaces/${spaceId}`, { name }),
  setSpaceColor: (year: number, spaceId: string, color: string | null) =>
    request("PUT", `${board(year)}/spaces/${spaceId}/color`, { color }),
  deleteSpace: (year: number, spaceId: string) => request("DELETE", `${board(year)}/spaces/${spaceId}`),

  addIdea: (year: number, spaceId: string, name: string) =>
    request<Idea>("POST", `${board(year)}/spaces/${spaceId}/ideas`, { name }),
  updateIdea: (year: number, ideaId: string, patch: IdeaPatch) =>
    request<Idea>("PATCH", `${board(year)}/ideas/${ideaId}`, patch),
  deleteIdea: (year: number, ideaId: string) => request("DELETE", `${board(year)}/ideas/${ideaId}`),

  settings: () => request<Settings>("GET", "/api/settings"),
  setSchoolHolidayStates: (states: string[]) =>
    request<Settings>("PUT", "/api/settings/school-holiday-states", { states }),
  schoolHolidays: (year: number) => request<SchoolHolidaysResponse>("GET", `/api/school-holidays/${year}`),

  people: () => request<Person[]>("GET", "/api/people"),
  addPerson: (name: string) => request<Person>("POST", "/api/people", { name }),
  renamePerson: (id: string, name: string) => request<Person>("PATCH", `/api/people/${id}`, { name }),
  rotateFeed: (id: string) => request<Person>("POST", `/api/people/${id}/rotate`),
  deletePerson: (id: string) => request("DELETE", `/api/people/${id}`),
};

export function feedUrl(person: Person): string {
  return `${window.location.origin}/ics/${person.feedId}.ics`;
}
