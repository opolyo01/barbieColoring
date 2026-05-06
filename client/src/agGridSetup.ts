import {
  CellApiModule,
  CellStyleModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  CustomEditorModule,
  EventApiModule,
  LargeTextEditorModule,
  ModuleRegistry,
  NumberEditorModule,
  RenderApiModule,
  RowApiModule,
  RowSelectionModule,
  RowStyleModule,
  ScrollApiModule,
  SelectEditorModule,
  TextEditorModule,
  ValidationModule,
} from 'ag-grid-community';
import {
  ContextMenuModule,
  LicenseManager,
  MenuModule,
  RowGroupingModule,
  RowGroupingPanelModule,
} from 'ag-grid-enterprise';

let initialized = false;

export function ensureAgGridSetup(): void {
  if (initialized) return;

  LicenseManager.setLicenseKey(import.meta.env.VITE_AG_GRID_LICENSE_KEY ?? '');
  ModuleRegistry.registerModules([
    ClientSideRowModelModule,
    ColumnApiModule,
    RowApiModule,
    ScrollApiModule,
    CellApiModule,
    RenderApiModule,
    EventApiModule,
    CellStyleModule,
    RowStyleModule,
    RowSelectionModule,
    TextEditorModule,
    NumberEditorModule,
    SelectEditorModule,
    LargeTextEditorModule,
    CustomEditorModule,
    ValidationModule,
    MenuModule,
    ContextMenuModule,
    RowGroupingModule,
    RowGroupingPanelModule,
  ]);
  initialized = true;
}

ensureAgGridSetup();
