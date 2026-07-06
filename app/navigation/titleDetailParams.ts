// Shared route params for the TitleDetail screen (Story 2.4).
//
// TitleDetail is pushed from two independent native-stacks (AddStack, HomeStack)
// with the identical shape — this one type is the single source of truth so
// neither stack's param-list type gets forced onto the other's navigator.

export type TitleDetailParams = { tmdbId: number; mediaType: 'movie' | 'tv' };
