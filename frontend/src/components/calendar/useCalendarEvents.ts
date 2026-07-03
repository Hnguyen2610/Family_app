import { useCallback, useEffect, useState } from 'react';
import { eventsAPI } from '@/lib/api-client';

type UseCalendarEventsOptions = {
  familyId: string;
  month: number;
  userId?: string;
  year: number;
};

export function useCalendarEvents({ familyId, month, userId, year }: UseCalendarEventsOptions) {
  const [events, setEvents] = useState<any[]>([]);
  const [eventsCache, setEventsCache] = useState<Record<string, any[]>>({});
  const [creatorId, setCreatorId] = useState<string>(userId || '');

  useEffect(() => {
    if (userId) setCreatorId(userId);
  }, [userId]);

  const fetchEvents = useCallback(async (forceRefresh = false) => {
    const key = `${familyId}-${year}-${month}`;
    if (!forceRefresh && eventsCache[key]) {
      setEvents(eventsCache[key]);
      return;
    }

    try {
      const response = await eventsAPI.getAll(familyId, month, year, creatorId);
      setEvents(response.data);
      setEventsCache((prev) => ({ ...prev, [key]: response.data }));
    } catch (error) {
      console.error('Failed to fetch events:', error);
    }
  }, [creatorId, eventsCache, familyId, month, year]);

  useEffect(() => {
    const key = `${familyId}-${year}-${month}`;
    if (eventsCache[key]) {
      setEvents(eventsCache[key]);
    } else {
      fetchEvents();
    }
  }, [eventsCache, familyId, fetchEvents, month, year]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchEvents(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  return {
    creatorId,
    events,
    fetchEvents,
  };
}
