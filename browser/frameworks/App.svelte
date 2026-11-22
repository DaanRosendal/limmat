<script>
  import { limmat } from 'limmat/svelte';

  let text = $state('');
  let done = $state(false);
  let other = $state(0);

  export function set(t, d) {
    text = t;
    done = d;
  }
  export function bump() {
    other += 1;
  }
</script>

<div>
  <p data-other>{other}</p>
  <div class="msg" use:limmat={{ text, done }}></div>
</div>
