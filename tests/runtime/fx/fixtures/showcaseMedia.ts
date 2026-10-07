/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

export function showcaseMediaDocument() {
  const transportPtsUs = Array.from({ length: 480 }, (_, i) => String(Math.round(i * 1_000_000 / 24)));
  const sources = [{ id: 'clip-a', title: 'Water', tags: ['water'], decision: { cycleFrames: 96 } }];
  const atlases = [0, 1].map(page => ({ id: `atlas-${page}`, codedWidth: 2000, codedHeight: 1856,
    activeRegionCount: 640, regions: Array.from({ length: 640 }, (_, i) => ({
      atlasId: `atlas-${page}`, atlasRegionId: `atlas-${page}-region-${String(i).padStart(3, '0')}`,
      atlasRegionIndex: i, sourceClipId: 'clip-a', frameMapId: 'phase-cycle', cycleFrames: 96,
      phaseOffsetFrames: 7 + 31 * page,
      activeRect: { x: i % 20 * 100 + 2, y: Math.floor(i / 20) * 58 + 2, width: 96, height: 54 },
    })) }));
  const instances = atlases.flatMap((atlas, page) => atlas.regions.map((region, i) => ({
    layerId: `tile-${Math.floor(i / 32)}-${i % 32 + page * 32}`, atlasId: atlas.id,
    atlasRegionId: region.atlasRegionId, cylinderSlot: Math.floor(i / 32) * 64 + i % 32 + page * 32,
  }))).sort((a, b) => a.cylinderSlot - b.cylinderSlot);
  const rendition = (id: string, count: number) => ({ id, codec: 'vp8', frameCount: count,
    segments: Array.from({ length: count / 48 }, (_, i) => ({ file: `${id}/segment-${i}.webm`,
      startFrame: i * 48, endFrame: i * 48 + 47, frameCount: 48, byteLength: 1024, checksum: 'a'.repeat(64) })) });
  return { schemaVersion: 2, packId: 'media-test', rate: 24, transportDurationUs: '20000000',
    transportFrameCount: 480, transportPtsUs, sources, atlases, instances, checksums: {},
    renditions: [...atlases.map(atlas => ({ ...rendition(atlas.id, 480), kind: 'atlas', atlasId: atlas.id,
      codedWidth: atlas.codedWidth, codedHeight: atlas.codedHeight, frameMapId: 'atlas-transport' })),
      { ...rendition('detail:clip-a', 96), kind: 'detail', sourceClipId: 'clip-a',
        codedWidth: 1920, codedHeight: 1080, frameMapId: 'source-cycle' }],
  };
}

export function showcaseDetailPage(document = showcaseMediaDocument()) {
  const tiles = document.instances.filter(i => Math.floor(i.cylinderSlot / 64) < 4 && i.cylinderSlot % 64 < 4)
    .map((instance, i) => {
      const region = document.atlases.find(a => a.id === instance.atlasId)!.regions.find(r => r.atlasRegionId === instance.atlasRegionId)!;
      return { tileId: instance.layerId, atlasId: instance.atlasId, atlasRegionId: region.atlasRegionId,
        sourceClipId: region.sourceClipId, phaseOffsetFrames: region.phaseOffsetFrames, cycleFrames: region.cycleFrames,
        activeRect: { x: i % 4 * 260 + 2, y: Math.floor(i / 4) * 148 + 2, width: 256, height: 144 },
        paddedRect: { x: i % 4 * 260, y: Math.floor(i / 4) * 148, width: 260, height: 148 } };
    });
  return { ...document.renditions[0], id: 'detail-page:256:0:0', kind: 'detail-page', atlasId: undefined,
    codec: 'vp09.00.40.08', codedWidth: 1040, codedHeight: 592, tiles };
}

export function showcaseCohortDocument() {
  const legacy = showcaseMediaDocument();
  const { transportPtsUs: _pts, transportDurationUs: _duration, transportFrameCount: _count, ...document } = legacy;
  const sources = [
    { id: 'clip-a', title: 'Water', tags: ['water'], decision: { usableFrames: 90, blackGapFrames: 6, cycleFrames: 96 },
      playback: { cycleFrames: 102, blackGapFrames: 12 } },
    { id: 'clip-b', title: 'City', tags: ['city'], decision: { usableFrames: 240, blackGapFrames: 6, cycleFrames: 246 },
      playback: { cycleFrames: 252, blackGapFrames: 12 } },
  ];
  const atlases = document.atlases.map(atlas => ({ ...atlas, regions: atlas.regions.map((region, i) => ({
    ...region, sourceClipId: i % 2 ? 'clip-b' : 'clip-a', cycleFrames: i % 2 ? 252 : 102,
  })) }));
  const segments = (id: string, count: number) => Array.from({ length: Math.ceil(count / 48) }, (_, i) => ({
    file: `${id}/segment-${i}.webm`, startFrame: i * 48, endFrame: Math.min(count - 1, i * 48 + 47),
    frameCount: Math.min(48, count - i * 48), byteLength: 1024, checksum: 'a'.repeat(64),
  }));
  const basePages = atlases.flatMap(atlas => [102, 252].map(cycleFrames => {
    const id = `base-${atlas.id}-${cycleFrames}`;
    const regions = atlas.regions.filter(region => region.cycleFrames === cycleFrames);
    const tiles = regions.map((region, i) => ({
      tileId: document.instances.find(instance => instance.atlasRegionId === region.atlasRegionId)!.layerId,
      atlasId: region.atlasId, atlasRegionId: region.atlasRegionId, sourceClipId: region.sourceClipId,
      cycleFrames, phaseOffsetFrames: region.phaseOffsetFrames,
      activeRect: { x: i % 20 * 100 + 2, y: Math.floor(i / 20) * 58 + 2, width: 96, height: 54 },
      paddedRect: { x: i % 20 * 100, y: Math.floor(i / 20) * 58, width: 100, height: 58 },
    }));
    return { id, kind: 'atlas-page', codec: 'vp8', codedWidth: 2000, codedHeight: 928,
      frameMapId: 'cohort-cycle', frameCount: cycleFrames, segments: segments(id, cycleFrames), tiles };
  }));
  return { ...document, schemaVersion: 3, timeline: 'independent-cycles', sources, atlases,
    renditions: [...basePages, ...sources.map(source => ({
      id: `detail:${source.id}`, kind: 'detail', sourceClipId: source.id, codec: 'vp8',
      codedWidth: 1920, codedHeight: 1080, frameCount: source.decision.cycleFrames,
      frameMapId: 'source-cycle', segments: segments(`detail:${source.id}`, source.decision.cycleFrames),
    }))],
  };
}
