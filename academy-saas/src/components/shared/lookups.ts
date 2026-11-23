'use client';
import { useMemo } from 'react';
import { useStore } from '@/lib/store/academy-store';
import type { AcademyData, ID, Team } from '@/lib/types';

export function currentTeamIds(data: AcademyData, playerId: ID): ID[] {
  return data.assignments.filter((a) => a.playerId === playerId && !a.endDate).map((a) => a.teamId);
}

export function useLookups() {
  const { data } = useStore();
  return useMemo(() => {
    const teams = new Map(data.teams.map((t) => [t.id, t]));
    const coaches = new Map(data.coaches.map((c) => [c.id, c]));
    const players = new Map(data.players.map((p) => [p.id, p]));
    const branches = new Map(data.branches.map((b) => [b.id, b]));
    const locations = new Map(data.locations.map((l) => [l.id, l]));
    const users = new Map(data.users.map((u) => [u.id, u]));
    const teamsOfPlayer = new Map<ID, Team[]>();
    for (const a of data.assignments) {
      if (a.endDate) continue;
      const t = teams.get(a.teamId);
      if (t) teamsOfPlayer.set(a.playerId, [...(teamsOfPlayer.get(a.playerId) ?? []), t]);
    }
    const rosterOf = new Map<ID, ID[]>();
    for (const a of data.assignments) if (!a.endDate) rosterOf.set(a.teamId, [...(rosterOf.get(a.teamId) ?? []), a.playerId]);
    const coachesOfTeam = new Map<ID, ID[]>();
    for (const tc of data.teamCoaches) coachesOfTeam.set(tc.teamId, [...(coachesOfTeam.get(tc.teamId) ?? []), tc.coachId]);
    const playerName = (id?: ID) => { const p = id ? players.get(id) : undefined; return p ? `${p.firstName} ${p.lastName}` : '—'; };
    return { teams, coaches, players, branches, locations, users, teamsOfPlayer, rosterOf, coachesOfTeam, playerName };
  }, [data]);
}
