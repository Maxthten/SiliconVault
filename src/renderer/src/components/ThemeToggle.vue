<!--
 * SiliconVault - Electronic Component Inventory Management System
 * Copyright (C) 2026 Maxton Niu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->
<script setup lang="ts">
import { inject } from 'vue'

// 注入全局主题状态
const isDark = inject('isDark')
// 修改类型定义：必须接收 MouseEvent，用于计算扩散圆心
const toggleTheme = inject('toggleTheme') as (event: MouseEvent) => void

</script>

<template>
  <div 
    class="sky-window" 
    :class="{ 'dark': isDark }" 
    @click="toggleTheme"
  >
    <div class="sky-container">
      
      <div class="stars">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 55" fill="none">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M135.831 3.00688C135.055 3.85027 134.111 4.29946 133 4.35447C134.111 4.40947 135.055 4.85867 135.831 5.71123C136.607 6.55462 136.996 7.56303 136.996 8.72727C136.996 7.95722 137.172 7.25134 137.525 6.59129C137.886 5.93124 138.372 5.39954 138.98 5.00535C139.598 4.60199 140.268 4.39114 141 4.35447C139.88 4.2903 138.936 3.85027 138.16 3.00688C137.384 2.16348 136.996 1.16425 136.996 0C136.996 1.16425 136.607 2.16348 135.831 3.00688ZM31 23.3545C32.1114 23.2995 33.0551 22.8503 33.8313 22.0069C34.6075 21.1635 34.9956 20.1642 34.9956 19C34.9956 20.1642 35.3837 21.1635 36.1599 22.0069C36.9361 22.8503 37.8798 23.2903 39 23.3545C38.2679 23.3911 37.5976 23.602 36.9802 24.0053C36.3716 24.3995 35.8864 24.9312 35.5248 25.5913C35.172 26.2513 34.9956 26.9572 34.9956 27.7273C34.9956 26.563 34.6075 25.5546 33.8313 24.7112C33.0551 23.8587 32.1114 23.4095 31 23.3545ZM0 36.3545C1.11136 36.2995 2.05513 35.8503 2.83131 35.0069C3.6075 34.1635 3.99559 33.1642 3.99559 32C3.99559 33.1642 4.38368 34.1635 5.15987 35.0069C5.93605 35.8503 6.87982 36.2903 8 36.3545C7.26792 36.3911 6.59757 36.602 5.98015 37.0053C5.37155 37.3995 4.88644 37.9312 4.52481 38.5913C4.172 39.2513 3.99559 39.9572 3.99559 40.7273C3.99559 39.563 3.6075 38.5546 2.83131 37.7112C2.05513 36.8587 1.11136 36.4095 0 36.3545ZM56.8313 24.0069C56.0551 24.8503 55.1114 25.2995 54 25.3545C55.1114 25.4095 56.0551 25.8587 56.8313 26.7112C57.6075 27.5546 57.9956 28.563 57.9956 29.7273C57.9956 28.9572 58.172 28.2513 58.5248 27.5913C58.8864 26.9312 59.3716 26.3995 59.9802 26.0053C60.5976 25.602 61.2679 25.3911 62 25.3545C60.8798 25.2903 59.9361 24.8503 59.1599 24.0069C58.3837 23.1635 57.9956 22.1642 57.9956 21C57.9956 22.1642 57.6075 23.1635 56.8313 24.0069ZM81 25.3545C82.1114 25.2995 83.0551 24.8503 83.8313 24.0069C84.6075 23.1635 84.9956 22.1642 84.9956 21C84.9956 22.1642 85.3837 23.1635 86.1599 24.0069C86.9361 24.8503 87.8798 25.2903 89 25.3545C88.2679 25.3911 87.5976 25.602 86.9802 26.0053C86.3716 26.3995 85.8864 26.9312 85.5248 27.5913C85.172 28.2513 84.9956 28.9572 84.9956 29.7273C84.9956 28.563 84.6075 27.5546 83.8313 26.7112C83.0551 25.8587 82.1114 25.4095 81 25.3545ZM136 36.3545C137.111 36.2995 138.055 35.8503 138.831 35.0069C139.607 34.1635 139.996 33.1642 139.996 32C139.996 33.1642 140.384 34.1635 141.16 35.0069C141.936 35.8503 142.88 36.2903 144 36.3545C143.268 36.3911 142.598 36.602 141.98 37.0053C141.372 37.3995 140.886 37.9312 140.525 38.5913C140.172 39.2513 139.996 39.9572 139.996 40.7273C139.996 39.563 139.607 38.5546 138.831 37.7112C138.055 36.8587 137.111 36.4095 136 36.3545ZM101.831 49.0069C101.055 49.8503 100.111 50.2995 99 50.3545C100.111 50.4095 101.055 50.8587 101.831 51.7112C102.607 52.5546 102.996 53.563 102.996 54.7273C102.996 53.9572 103.172 53.2513 103.525 52.5913C103.886 51.9312 104.372 51.3995 104.98 51.0053C105.598 50.602 106.268 50.3911 107 50.3545C105.88 50.2903 104.936 49.8503 104.16 49.0069C103.384 48.1635 102.996 47.1642 102.996 46C102.996 47.1642 102.607 48.1635 101.831 49.0069Z" fill="currentColor"></path>
        </svg>
      </div>

      <div class="clouds"></div>

      <div class="sun-moon">
        <div class="moon-mask">
          <div class="crater"></div>
          <div class="crater"></div>
          <div class="crater"></div>
        </div>
      </div>
      
    </div>
  </div>
</template>

<style scoped>
/* 样式完全保持不变，省略以节省篇幅 */
.sky-window {
  --size: 44px;
  --bg-day: #3d7eae;
  --bg-night: #1d1f2c;
  --sun-color: #ecca2f;
  --moon-color: #c4c9d1;
  --crater-color: #959db1;
  --star-color: #ffffff;
  --cloud-front: #f3fdff;
  --cloud-back: #aacadf;
  --sun-size: 18px;
  
  width: var(--size);
  height: var(--size);
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
  box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}

.sky-window:hover {
  transform: scale(1.05);
}

.sky-container {
  width: 100%;
  height: 100%;
  background-color: var(--bg-day);
  transition: background-color 0.4s ease;
  position: relative;
}

.sky-window.dark .sky-container {
  background-color: var(--bg-night);
}

.sun-moon {
  width: var(--sun-size);
  height: var(--sun-size);
  background-color: var(--sun-color);
  border-radius: 50%;
  position: absolute;
  top: 50%;
  left: 50%;
  margin-top: calc(var(--sun-size) / -2);
  margin-left: calc(var(--sun-size) / -2);
  box-shadow: 
    0 0 0 4px rgba(255, 255, 255, 0.1),
    0 0 0 8px rgba(255, 255, 255, 0.1),
    inset 2px 2px 4px rgba(255, 255, 230, 0.5); 
  transition: transform 0.5s cubic-bezier(0.5, 0, 0.2, 1.5);
  overflow: hidden;
}

.sky-window.dark .sun-moon {
  transform: scale(0.9);
}

.moon-mask {
  width: 100%;
  height: 100%;
  background-color: var(--moon-color);
  border-radius: 50%;
  position: absolute;
  top: 0;
  left: 0;
  transform: translateX(100%); 
  transition: transform 0.4s cubic-bezier(0.6, 0, 0.4, 1);
  box-shadow: inset -2px -2px 4px rgba(0,0,0,0.2);
}

.sky-window.dark .moon-mask {
  transform: translateX(0);
}

.crater {
  position: absolute;
  background-color: var(--crater-color);
  border-radius: 50%;
  opacity: 0.6;
}
.crater:nth-child(1) { top: 20%; left: 20%; width: 30%; height: 30%; }
.crater:nth-child(2) { top: 60%; left: 50%; width: 20%; height: 20%; }
.crater:nth-child(3) { top: 30%; left: 60%; width: 15%; height: 15%; }

.stars {
  position: absolute;
  top: 6px;
  left: 5px;
  width: 34px;
  color: var(--star-color);
  opacity: 0;
  transform: translateY(-20px);
  transition: all 0.4s ease;
  z-index: 1;
}

.sky-window.dark .stars {
  opacity: 1;
  transform: translateY(0);
}

.clouds {
  position: absolute;
  bottom: 6px;
  left: 8px;
  width: 10px;
  height: 10px;
  background-color: var(--cloud-front);
  border-radius: 50%;
  box-shadow: 
    8px 2px 0 var(--cloud-front),
    14px 0 0 var(--cloud-front),
    20px 4px 0 var(--cloud-front),
    4px -2px 0 var(--cloud-back),
    12px -4px 0 var(--cloud-back),
    18px -2px 0 var(--cloud-back);
  transition: all 0.4s ease;
  opacity: 1;
  transform: translateY(0);
}

.sky-window.dark .clouds {
  opacity: 0;
  transform: translateY(20px);
}
</style>