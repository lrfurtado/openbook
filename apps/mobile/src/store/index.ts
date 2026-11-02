import { combineReducers, configureStore } from '@reduxjs/toolkit';
import Storage from 'expo-sqlite/kv-store';
import { useDispatch, useSelector } from 'react-redux';
import { FLUSH, PAUSE, PERSIST, persistReducer, persistStore, PURGE, REGISTER, REHYDRATE } from 'redux-persist';
import { catalogApi } from './api';
import { appSlice, downloadsSlice, gateSlice } from './appSlice';

const rootReducer = combineReducers({
  app: persistReducer({ key: 'app', storage: Storage, version: 1 }, appSlice.reducer),
  gate: gateSlice.reducer,
  downloads: downloadsSlice.reducer,
  [catalogApi.reducerPath]: catalogApi.reducer,
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefault) =>
    getDefault({ serializableCheck: { ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER] } }).concat(
      catalogApi.middleware,
    ),
});

// Started by the root layout once this tab owns the local database (see lib/tabLock).
// `manualPersist` is supported at runtime but missing from redux-persist's type definitions.
export const persistor = persistStore(store, { manualPersist: true } as never);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
