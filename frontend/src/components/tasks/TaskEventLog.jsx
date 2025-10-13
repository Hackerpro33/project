import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

function formatTimestamp(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString();
  } catch (error) {
    return value;
  }
}

export default function TaskEventLog() {
  const { t } = useTranslation();
  const [taskIdInput, setTaskIdInput] = useState('');
  const [events, setEvents] = useState([]);
  const [connectionState, setConnectionState] = useState('idle');
  const sourceRef = useRef(null);

  const disconnect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setConnectionState('idle');
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  const handleConnect = () => {
    const taskId = taskIdInput.trim();
    if (!taskId) return;
    disconnect();
    setEvents([]);
    setConnectionState('connecting');
    const source = new EventSource(`/api/tasks/${encodeURIComponent(taskId)}/events`);
    sourceRef.current = source;

    const appendEvent = (event) => {
      setEvents((prev) => [event, ...prev].slice(0, 50));
    };

    source.addEventListener('status', (event) => {
      try {
        const data = JSON.parse(event.data);
        appendEvent({ type: 'status', ...data });
        setConnectionState(data.status === 'finished' || data.status === 'failed' ? 'idle' : 'listening');
        if (data.status === 'finished' || data.status === 'failed') {
          source.close();
        }
      } catch (error) {
        console.error('Failed to parse status event', error);
      }
    });

    source.addEventListener('heartbeat', (event) => {
      try {
        const data = JSON.parse(event.data);
        appendEvent({ type: 'heartbeat', ...data });
        setConnectionState('listening');
      } catch (error) {
        console.error('Failed to parse heartbeat event', error);
      }
    });

    source.addEventListener('error', (event) => {
      try {
        const data = event.data ? JSON.parse(event.data) : {};
        appendEvent({ type: 'error', ...data });
      } catch (error) {
        appendEvent({ type: 'error', error: event.data });
      }
      setConnectionState('error');
      source.close();
    });

    setConnectionState('listening');
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg">{t('tasks.logTitle')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('tasks.logDescription')}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Input
            value={taskIdInput}
            onChange={(event) => setTaskIdInput(event.target.value)}
            placeholder={t('tasks.inputPlaceholder')}
            className="sm:w-56"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleConnect}>
              {connectionState === 'listening'
                ? t('tasks.refresh')
                : t('tasks.subscribe')}
            </Button>
            <Button size="sm" variant="outline" onClick={disconnect}>
              {t('tasks.disconnect')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('tasks.emptyLog')}</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event, index) => (
              <li
                key={`${event.timestamp}-${event.status}-${index}`}
                className="rounded-md border border-border bg-muted/40 p-3"
              >
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{t(`tasks.eventTypes.${event.type}`, { defaultValue: event.type })}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatTimestamp(event.timestamp)}
                  </span>
                </div>
                <div className="mt-1 text-sm">
                  {event.status && (
                    <span className="font-semibold">{t('tasks.statusLabel')}: {event.status}</span>
                  )}
                  {event.error && (
                    <p className="text-destructive">{event.error}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
