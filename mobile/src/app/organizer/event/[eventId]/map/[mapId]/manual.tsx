import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { EventMap } from '@/components/map';
import { Screen } from '@/components/screen';
import { Alert, Button, Card, Icon, Text } from '@/components/ui';
import { repository } from '@/data';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useMapGestureNavigation } from '@/hooks/useMapGestureNavigation';
import { resolveEventMapCenter } from '@/services/eventMapLocation';
import { colors } from '@/theme/tokens';
import type { Coordinate } from '@/types/coordinates';
import type { MapGeometry, MapMarker, MapPolyline } from '@/types/map';
import { toErrorMessage } from '@/utils/errors';
import { formatDistance } from '@/utils/format';
import { geometryLengthInMeters } from '@/utils/geo';

/** Desenho manual de um caminho: cada toque no mapa acrescenta um vértice. */
export default function DrawManualPathScreen() {
  const { eventId, mapId } = useLocalSearchParams<{ eventId: string; mapId: string }>();
  const id = mapId ?? '';
  const eventCenter = useAsyncData(() => resolveEventMapCenter(eventId ?? ''), eventId ?? '');
  const mapGestures = useMapGestureNavigation();
  const [geometry, setGeometry] = useState<MapGeometry>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const distanceMeters = geometryLengthInMeters(geometry);
  const canSave = geometry.length >= 2 && distanceMeters > 0;

  const markers = useMemo<MapMarker[]>(() => {
    const start = geometry[0];
    if (!start) return [];

    if (geometry.length === 1) {
      return [{ id: 'manual-start', coordinate: start, label: 'Início do caminho' }];
    }

    const end = geometry[geometry.length - 1];
    if (!end) return [];

    return [
      { id: 'manual-start', coordinate: start, label: 'Início do caminho' },
      { id: 'manual-end', coordinate: end, label: 'Último ponto do caminho' },
    ];
  }, [geometry]);

  const polylines = useMemo<MapPolyline[]>(
    () => (geometry.length >= 2 ? [{ id: 'manual-path', geometry, tone: 'default' }] : []),
    [geometry],
  );

  const addPoint = useCallback(
    (coordinate: Coordinate) => {
      if (isSaving) return;
      setGeometry((current) => [...current, coordinate]);
      setSaveError(null);
    },
    [isSaving],
  );

  const undoPoint = useCallback(() => {
    setGeometry((current) => current.slice(0, -1));
    setSaveError(null);
  }, []);

  const clearPath = useCallback(() => {
    setGeometry([]);
    setSaveError(null);
  }, []);

  const savePath = useCallback(async () => {
    if (!canSave || isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      await repository.createPath({ mapId: id, geometry });
      router.back();
    } catch (error) {
      setSaveError(toErrorMessage(error, 'Não foi possível salvar o caminho. Tente novamente.'));
      setIsSaving(false);
    }
  }, [canSave, geometry, id, isSaving]);

  return (
    <>
      <Stack.Screen
        options={{ ...mapGestures.screenOptions, title: 'Desenhar caminho manualmente' }}
      />

      <Screen contentClassName="flex-1 gap-3 px-5 py-4" testID="manual-path-screen">
        {eventCenter.state.status === 'loading' ? (
          <Card className="flex-1 justify-center" variant="soft">
            <Text variant="body">Localizando o endereço do evento…</Text>
          </Card>
        ) : eventCenter.state.status === 'error' ? (
          <View className="flex-1 justify-center gap-3">
            <Alert
              tone="error"
              title="Não foi possível localizar o endereço do evento"
              description={eventCenter.state.message}
            />
            <Button
              label="Tentar novamente"
              variant="outline"
              onPress={() => eventCenter.reload()}
            />
          </View>
        ) : (
          <>
            <View className="min-h-56 flex-1" {...mapGestures.touchHandlers}>
              <EventMap
                className="h-full rounded-lg border border-border"
                markers={markers}
                polylines={polylines}
                onMapPress={addPoint}
                initialFocus={eventCenter.state.data}
                autoFitContent={false}
                accessibilityLabel={`Mapa para desenhar o caminho. ${geometry.length} pontos adicionados.`}
                testID="manual-path-map"
              />
            </View>

            <Card variant="soft">
              <View className="gap-2">
                <Text variant="label">Toque no mapa para desenhar</Text>
                <Text variant="caption">
                  Cada toque adiciona um ponto ao trajeto. Navegue pelo mapa sem usar a localização
                  do aparelho.
                </Text>
                <Text
                  variant="caption"
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={`${geometry.length} pontos adicionados. Distância estimada: ${formatDistance(distanceMeters)}.`}
                >
                  {geometry.length} {geometry.length === 1 ? 'ponto' : 'pontos'} ·{' '}
                  {formatDistance(distanceMeters)}
                </Text>
              </View>
            </Card>

            <View className="flex-row gap-3">
              <Button
                label="Desfazer"
                variant="outline"
                iconStart={<Icon name="undo" size={20} color={colors.content} />}
                onPress={undoPoint}
                disabled={geometry.length === 0 || isSaving}
                size="md"
                className="flex-1"
              />
              <Button
                label="Limpar desenho"
                variant="ghost"
                onPress={clearPath}
                disabled={geometry.length === 0 || isSaving}
                size="md"
                className="flex-1"
              />
            </View>

            {saveError ? (
              <Alert tone="error" title="Não foi possível salvar" description={saveError} />
            ) : null}

            <Button
              label="Salvar caminho no mapa"
              iconStart={<Icon name="content-save-outline" size={20} color={colors.white} />}
              onPress={() => void savePath()}
              loading={isSaving}
              disabled={!canSave}
              fullWidth
            />
          </>
        )}
      </Screen>
    </>
  );
}
