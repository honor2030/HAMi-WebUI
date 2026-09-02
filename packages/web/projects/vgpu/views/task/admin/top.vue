<template>
  <div class="task-top-box">
    <TabTop
      v-for="item in topConfig"
      :key="item.key"
      ref="topRefs"
      class="item"
      v-bind="item"
      :onClick="handleChartClick"
    />
  </div>
</template>

<script setup>
import TabTop from '~/vgpu/components/TabTop.vue';
import { useRouter } from 'vue-router';
import nodeApi from '~/vgpu/api/node';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { computed, ref } from 'vue';
import { settleAll } from '~/vgpu/hooks/liveSummary.mjs';

const router = useRouter();
const { t } = useI18n();

const handleChartClick = async (params) => {
  const name = params.data.name;
  const activeTabKey = params.tabActive;
  if (activeTabKey === 'node') {
    const { list } = await nodeApi.getNodes({ filters: {} });
    const node = list.find((node) => node.name === name);
    if (node) {
      const uuid = node.uid;
      router.push(`/admin/vgpu/node/admin/${uuid}?nodeName=${name}`);
    } else {
      ElMessage.error(t('node.nodeNotFound'));
    }
  } else if (activeTabKey === 'device_uuid') {
    router.push({
      path: `/admin/vgpu/card/admin/${name}`,
    });
  } else {
    const [containerName, podUid] = name.split(':');
    router.push({
      path: '/admin/vgpu/task/admin/detail',
      query: {
        name: containerName,
        podUid: podUid,
      },
    });
  }
};

const topConfig = computed(() => [
  {
    title: t('task.topCount'),
    key: 'total',
    config: [
      {
        tab: t('dashboard.node'),
        key: 'node',
        nameKey: 'node',
        data: [],
        unit: ' ',
        query:
          'topk(5, count by (node) (sum by (container_pod_uuid, node) (hami_container_vcore_allocated)))',
      },
      {
        tab: t('dashboard.card'),
        key: 'device_uuid',
        data: [],
        nameKey: 'device_uuid',
        unit: ' ',
        query:
          'topk(5, count by (device_uuid) (sum by (container_pod_uuid, device_uuid) (hami_container_vcore_allocated)))',
      },
    ],
  },
  {
    title: t('task.topApply'),
    key: 'apply',
    config: [
      {
        tab: t('dashboard.compute'),
        key: 'core',
        data: [],
        nameKey: 'container_pod_uuid',
        unit: ' ',
        query: 'topk(5, avg by (container_pod_uuid) (hami_container_vcore_allocated))',
      },
      {
        tab: t('dashboard.memory'),
        key: 'memory',
        data: [],
        unit: 'GiB',
        nameKey: 'container_pod_uuid',
        query:
          'topk(5, avg by (container_pod_uuid) (hami_container_vmemory_allocated))/1024',
      },
      {
        tab: 'vGPU',
        key: 'vgpu',
        data: [],
        nameKey: 'container_pod_uuid',
        unit: '个',
        query: 'topk(5, avg by (container_pod_uuid) (hami_container_vgpu_allocated))',
      },
    ],
  },
]);

// Template ref inside v-for: Vue fills an array with the TabTop instances.
const topRefs = ref([]);

// Exposed so the Workloads page can refresh these charts from its existing
// polling controller (`useAutoRefresh`) on the same cadence as the table.
const refresh = ({ background = false } = {}) =>
  settleAll(
    (topRefs.value || [])
      .filter((top) => top && typeof top.refresh === 'function')
      .map((top) => () => top.refresh({ background })),
  );

defineExpose({ refresh });
</script>

<style scoped lang="scss">
.task-top-box {
  display: flex;
  gap: 16px;
  .item {
    flex: 1;
  }
}
</style>
